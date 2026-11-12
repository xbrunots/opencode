import { createReadStream } from "node:fs"
import { readFile, realpath, stat } from "node:fs/promises"
import { createServer } from "node:net"
import path from "node:path"
import { NodeHttpClient } from "@effect/platform-node"
import { OpenCode } from "@opencode/client/effect"
import { SessionID } from "@opencode/schema/session-id"
import electron from "electron"
import { Effect, ManagedRuntime } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import type { Plugin } from "@opencode/plugin/gui/main"
import { HtmlPreview } from "./preview-ipc"
import { previewAssets, previewFile } from "./preview-files"
import { inspectPreview } from "./preview-inspect"
import { artifactReference, previewArtifact } from "./preview-artifact"

const scheme = "oc-preview"

const setup: Plugin.MainSetup = (ctx) => {
  const runtime = ManagedRuntime.make(NodeHttpClient.layerNodeHttp)
  const views = new Map<string, { window: number; close: () => void; view: Electron.WebContentsView; source: (url: URL) => Promise<{ path: string; content: string } | undefined>; style?: string; styling: Promise<void> }>()

  const provider = ctx.provide(HtmlPreview, {
    open: async (input, caller) => {
      const server = ctx.serverEndpoints.get(input.server)
      const win = ctx.windows.get(caller.window)

      if (!server || !win || win.isDestroyed()) throw new Error("file.preview.unavailable")

      if (input.inline !== undefined && Buffer.byteLength(input.inline, "utf8") > 4 * 1024 * 1024) throw new Error("file.preview.tooLarge")

      const location = await runtime.runPromise(
        Effect.gen(function* () {
          const http = yield* HttpClient.HttpClient

          const client = yield* OpenCode.make({ baseUrl: server.url }).pipe(
            Effect.provideService(
              HttpClient.HttpClient,
              Object.keys(server.headers).length
                ? HttpClient.mapRequest(http, HttpClientRequest.setHeaders(server.headers))
                : http,
            ),
          )

          return (yield* client.session.get({ sessionID: SessionID.make(input.session) })).location.directory
        }),
      )

      const artifact = input.inline === undefined && artifactReference(input.path, server.url)
        ? await previewArtifact({ server, session: input.session, directory: location, path: input.path })
        : undefined

      if (input.inline === undefined && artifactReference(input.path, server.url) && !artifact) throw new Error("file.preview.invalid")

      if (input.inline === undefined && !artifact && !server.sameMachine) throw new Error("file.preview.unavailable")
      const root = artifact || input.inline !== undefined ? undefined : await realpath(location)
      const target = root ? await previewFile(root, input.path) : undefined

      if (!artifact && input.inline === undefined && (!target || !/\.html?$/i.test(target))) throw new Error("file.preview.invalid")
      const assets = root && target ? await previewAssets(root, target) : undefined
      const relative = input.inline !== undefined ? "index.html" : artifact ? artifact.entry : path.relative(root!, target!).split(path.sep).join("/")

      if (!/\.html?$/i.test(relative)) throw new Error("file.preview.invalid")

      const source = async (url: URL) => {
        const relative = decodeURIComponent(url.pathname.slice(1))

        if (input.inline !== undefined) return relative === "index.html" ? { path: "HTML inline", content: input.inline } : undefined

        if (artifact) {
          const response = await artifact.read(relative, "GET")

          if (!response) return
          const content = await response.text()

          if (content.length > 4 * 1024 * 1024) return

          return { path: artifact.sourcePath(relative), content }
        }

        if (!root || !assets) return
        const file = await previewFile(root, relative).catch(() => undefined)

        if (!file || !assets.has(file)) return

        if ((await stat(file)).size > 4 * 1024 * 1024) return

        return { path: path.relative(root, file), content: await readFile(file, "utf8") }
      }

      if (win.isDestroyed()) throw new Error("file.preview.unavailable")

      const partition = `opencode-preview-${crypto.randomUUID()}`
      const session = electron.session.fromPartition(partition)
      const deny = createServer((socket) => socket.destroy())

      const port = await new Promise<number>((resolve, reject) => {
        deny.once("error", reject)
        deny.listen(0, "127.0.0.1", () => {
          const address = deny.address()

          // SAFETY: listen() above requests a TCP address, rather than an IPC pipe.
          // oxlint-disable-next-line anti-slop/no-runtime-typeof
          if (address && typeof address !== "string") return resolve(address.port)
          reject(new Error("file.preview.proxy"))
        })
      })

      let registered = false

      try {
        // WebRTC TCP is not covered by webRequest or connect-src; use our own rejecting local proxy.
        await session.setProxy({ proxyRules: `socks5://127.0.0.1:${port}`, proxyBypassRules: "<-loopback>" })
        session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
        session.setPermissionCheckHandler(() => false)
        session.webRequest.onBeforeRequest((details, callback) => {
          callback({
            cancel:
              !details.url.startsWith(`${scheme}://workspace/`) &&
              !details.url.startsWith("blob:") &&
              !details.url.startsWith("data:"),
          })
        })
        session.protocol.handle(scheme, async (request) => {
          if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 })
          const url = new URL(request.url)

          if (url.hostname !== "workspace") return new Response(null, { status: 403 })

          if (input.inline !== undefined) {
            if (url.pathname !== "/index.html") return new Response(null, { status: 404 })

            return new Response(request.method === "HEAD" ? null : input.inline, { headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Security-Policy": "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; form-action 'none'; base-uri 'self'; object-src 'none'",
              "X-DNS-Prefetch-Control": "off",
            } })
          }

          if (artifact) {
            const response = await artifact.read(decodeURIComponent(url.pathname.slice(1)), request.method)

            if (!response) return new Response(null, { status: 404 })
            const headers = new Headers(response.headers)

            if (/\.html?$/i.test(url.pathname)) {
              headers.set("Content-Security-Policy", "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; form-action 'none'; base-uri 'self'; object-src 'none'")
              headers.set("X-DNS-Prefetch-Control", "off")
            }

            return new Response(response.body, { status: response.status, headers })
          }

          if (!root || !assets) return new Response(null, { status: 404 })
          const file = await previewFile(root, decodeURIComponent(url.pathname.slice(1))).catch(() => undefined)

          if (!file || !assets.has(file)) return new Response(null, { status: 404 })
          const size = (await stat(file)).size
          const range = request.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/)
          const start = range ? Number(range[1]) : 0
          const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1

          if (range && (start >= size || end < start))
            return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } })

          const types = new Map([
            [".html", "text/html; charset=utf-8"],
            [".htm", "text/html; charset=utf-8"],
            [".css", "text/css; charset=utf-8"],
            [".js", "text/javascript; charset=utf-8"],
            [".mjs", "text/javascript; charset=utf-8"],
            [".json", "application/json"],
            [".svg", "image/svg+xml"],
            [".png", "image/png"],
            [".jpg", "image/jpeg"],
            [".jpeg", "image/jpeg"],
            [".gif", "image/gif"],
            [".webp", "image/webp"],
            [".avif", "image/avif"],
            [".ico", "image/x-icon"],
            [".woff", "font/woff"],
            [".woff2", "font/woff2"],
            [".ttf", "font/ttf"],
            [".otf", "font/otf"],
            [".mp4", "video/mp4"],
            [".webm", "video/webm"],
            [".mp3", "audio/mpeg"],
            [".wav", "audio/wav"],
          ])

          const headers = new Headers({
            "Content-Type": types.get(path.extname(file).toLowerCase()) ?? "application/octet-stream",
            "Content-Length": String(end - start + 1),
            "Accept-Ranges": "bytes",
          })

          if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`)

          if (/\.html?$/i.test(file)) {
            headers.set(
              "Content-Security-Policy",
              "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; form-action 'none'; base-uri 'self'; object-src 'none'",
            )
            headers.set("X-DNS-Prefetch-Control", "off")
          }

          const body = request.method === "HEAD" || !size ? null : fileStream(file, start, end)

          return new Response(body, { status: range ? 206 : 200, headers })
        })

        const view = new electron.WebContentsView({
          webPreferences: {
            partition,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            webviewTag: false,
          },
        })

        const contents = view.webContents
        contents.setWindowOpenHandler(() => ({ action: "deny" }))
        contents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp")

        const guard = (event: Electron.Event<{ url: string }>) => {
          if (event.url !== "about:blank" && !event.url.startsWith(`${scheme}://workspace/`)) event.preventDefault()
        }

        contents.on("will-frame-navigate", guard)
        contents.on("will-redirect", guard)
        const embed = ctx.embeds.create(view, win)
        contents.on("context-menu", () => provider.emit("contextMenu", { id: embed.id }, caller.window))

        const close = () => {
          if (!views.has(embed.id)) return
          views.delete(embed.id)
          win.off("closed", close)
          embed.dispose()

          if (!contents.isDestroyed()) contents.close()
          session.protocol.unhandle(scheme)
          deny.close()
        }

        views.set(embed.id, { window: caller.window, close, view, source, styling: Promise.resolve() })
        registered = true
        win.once("closed", close)
        contents.once("destroyed", close)
        embed.show(true)
        const location = relative.split("/").map(encodeURIComponent).join("/")
        await contents.loadURL(`${scheme}://workspace/${location}`).catch(() => {
          close()
          throw new Error("file.preview.load")
        })

        return { id: embed.id }
      } finally {
        if (!registered) deny.close()
      }
    },
    freeze: async (input, caller) => {
      const entry = views.get(input.id)

      if (!entry || entry.window !== caller.window || entry.view.webContents.isDestroyed()) return
      const debugger_ = entry.view.webContents.debugger

      if (!debugger_.isAttached()) debugger_.attach("1.3")
      await debugger_.sendCommand("Animation.enable")

      if (input.active) {
        await debugger_.sendCommand("Animation.setPlaybackRate", { playbackRate: 0 })
        await debugger_.sendCommand("Page.setWebLifecycleState", { state: "frozen" }).catch(async (error) => {
          await debugger_.sendCommand("Animation.setPlaybackRate", { playbackRate: 1 })
          throw error
        })

        return
      }

      await debugger_.sendCommand("Page.setWebLifecycleState", { state: "active" })
      await debugger_.sendCommand("Animation.setPlaybackRate", { playbackRate: 1 })
    },
    appearance: async (input, caller) => {
      const entry = views.get(input.id)
      if (!entry || entry.window !== caller.window) return
      entry.styling = entry.styling.then(async () => {
        const contents = entry.view.webContents
        if (contents.isDestroyed()) return
        const thumb = input.mode === "dark" ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.22)"
        const key = await contents.insertCSS(`*::-webkit-scrollbar { width: 6px !important; height: 6px !important; } *::-webkit-scrollbar-track { background: transparent !important; } *::-webkit-scrollbar-thumb { background: ${thumb} !important; border-radius: 6px !important; }`)
        if (entry.style && !contents.isDestroyed()) await contents.removeInsertedCSS(entry.style)
        entry.style = key
      }).catch(() => undefined)
      await entry.styling
    },
    inspect: async (input, caller) => {
      const entry = views.get(input.id)

      if (!entry || entry.window !== caller.window) return null

      return inspectPreview({ ...input, view: entry.view, source: entry.source }).catch(() => null)
    },
    close: async (input, caller) => {
      const view = views.get(input.id)

      if (view?.window === caller.window) view.close()
    },
  })

  ctx.onCleanup(async () => {
    views.forEach((view) => view.close())
    await runtime.dispose()
  })
}

function fileStream(file: string, start: number, end: number) {
  const stream = createReadStream(file, { start, end })
  const chunks = stream[Symbol.asyncIterator]()

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = await chunks.next()

      if (result.done) return controller.close()
      controller.enqueue(result.value)
    },
    cancel() {
      stream.destroy()
    },
  })
}

export default setup
