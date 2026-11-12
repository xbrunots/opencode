import type { ServerEndpoint } from "@opencode/plugin/gui/main"
import { Artifact } from "@opencode/schema/artifact"
import { Schema } from "effect"

const content = Schema.Struct({ data: Artifact.Content })

const inventory = Schema.Struct({ data: Schema.Array(Artifact.Info) })

const MAX_PREVIEW_BYTES = 32 * 1024 * 1024

const PREVIEW_TIMEOUT = 30_000

/** A published artifact reference on the configured server, never an arbitrary destination. */
export function artifactReference(reference: string, server: string) {
  if (!URL.canParse(reference, server)) return
  const base = new URL(server)
  const url = new URL(reference, base)

  if (url.origin !== base.origin || url.username || url.password) return
  const match = /^\/api\/experimental\/artifacts\/(art_[a-zA-Z0-9]{26})\/view(?:\/(.*))?$/.exec(url.pathname)

  if (!match) return
  const file = match[2] ? decodePath(match[2]) : undefined

  if (match[2] && !file) return

  return { id: match[1], file }
}

/** Resolve the artifact in the active project and session; credentials remain in the main process. */
export async function previewArtifact(input: {
  server: ServerEndpoint
  session: string
  directory: string
  path: string
}) {
  const reference = artifactReference(input.path, input.server.url)

  if (!reference) return
  const metadata = new URL(`/api/experimental/artifacts/${encodeURIComponent(reference.id)}`, input.server.url)
  metadata.searchParams.set("location[directory]", input.directory)

  const load = async () => {
    const response = await fetch(metadata, { headers: input.server.headers, redirect: "manual", signal: AbortSignal.timeout(PREVIEW_TIMEOUT) })

    if (!response.ok) return

    return Schema.decodeUnknownSync(content)(JSON.parse(await boundedText(response))).data
  }

  const value = await load()

  if (!value) return

  if (value.info.id !== reference.id || value.info.sessionID !== input.session || value.info.provider !== "local") return
  const files = new Set(Object.keys(value.files).filter((name) => decodePath(name) === name))
  const entry = reference.file ?? value.info.entry

  if (!files.has(entry)) return

  // Concurrent asset requests share only an in-flight check; later batches revalidate the owner/version.
  let verification: Promise<boolean> | undefined

  const verify = () => {
    if (verification) return verification
    const url = new URL("/api/experimental/artifacts", input.server.url)
    url.searchParams.set("location[directory]", input.directory)
    url.searchParams.set("sessionID", input.session)
    verification = fetch(url, { headers: input.server.headers, redirect: "manual", signal: AbortSignal.timeout(PREVIEW_TIMEOUT) })
      .then(async (response) => {
        if (!response.ok) return false
        const items = Schema.decodeUnknownSync(inventory)(JSON.parse(await boundedText(response))).data
        const current = items.find((item) => item.id === value.info.id)

        return current?.sessionID === input.session && current.provider === "local" && current.time.updated === value.info.time.updated
      })
      .finally(() => { verification = undefined })

    return verification
  }

  return {
    entry,
    sourcePath: (file: string) => `/api/experimental/artifacts/${reference.id}/view/${file.split("/").map(encodeURIComponent).join("/")}`,
    /** Serve only files in this artifact; backend redirects and headers never reach the preview. */
    async read(file: string, method: "GET" | "HEAD") {
      if (decodePath(file) !== file || !files.has(file)) return

      if (!await verify()) return
      const url = new URL(`/api/experimental/artifacts/${encodeURIComponent(reference.id)}/view/${file.split("/").map(encodeURIComponent).join("/")}`, input.server.url)
      url.searchParams.set("location[directory]", input.directory)
      const result = await fetch(url, { method, headers: input.server.headers, redirect: "manual", signal: AbortSignal.timeout(PREVIEW_TIMEOUT) })

      if (!result.ok) return

      return new Response(method === "HEAD" ? null : boundedBody(result), {
        status: result.status,
        headers: { "Content-Type": result.headers.get("Content-Type") ?? "application/octet-stream" },
      })
    },
  }
}

/** Limit metadata before JSON parsing; Content-Length alone may be absent or inaccurate. */
async function boundedText(response: Response) {
  const body = boundedBody(response)

  if (!body) throw new Error("file.preview.empty")

  return new Response(body).text()
}

/** Stream resources without buffering unbounded responses from the configured server. */
function boundedBody(response: Response) {
  const length = Number(response.headers.get("content-length"))

  if (length > MAX_PREVIEW_BYTES) {
    void response.body?.cancel()
    throw new Error("file.preview.tooLarge")
  }

  if (!response.body) return null
  const reader = response.body.getReader()
  let size = 0

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await reader.read()

      if (next.done) return controller.close()
      size += next.value.byteLength

      if (size > MAX_PREVIEW_BYTES) {
        await reader.cancel()

        return controller.error(new Error("file.preview.tooLarge"))
      }

      controller.enqueue(next.value)
    },
    cancel: () => reader.cancel(),
  })
}

function decodePath(value: string) {
  try {
    const decoded = decodeURIComponent(value)

    if (!decoded || decoded.includes("\\") || decoded.includes("\0")) return

    if (decoded.split("/").some((part) => !part || part === "." || part === "..")) return

    return decoded
  } catch {
    return
  }
}
