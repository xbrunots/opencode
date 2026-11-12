import { localImagePath } from "./markdown-image"
import type { OpenMarkdownPreview, ReadMarkdownPreview } from "../context/markdown"
import { markdownPreviewActions } from "./markdown-preview-actions"
import { markdownPreviewAnnotation } from "./markdown-preview-annotation"
import { checksum } from "@opencode/util/encode"
import { safeHtmlPreview } from "./safe-html-preview"

type MediaReference = { kind: "youtube" | "video" | "html" | "html-code" | "website"; source: string; local: boolean }

export function markdownMediaReference(source: string): MediaReference | undefined {
  const value = source.trim()
  if (!value) return
  if (/^https?:\/\//i.test(value)) {
    if (!URL.canParse(value)) return
    const url = new URL(value)
    if (!["http:", "https:"].includes(url.protocol)) return
    const host = url.hostname.toLowerCase().replace(/^www\./, "")
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1)
        : host === "youtube.com" || host === "m.youtube.com"
          ? url.pathname === "/watch"
            ? url.searchParams.get("v")
            : url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]
          : undefined
    if (id && /^[\w-]{11}$/.test(id)) return { kind: "youtube", source: id, local: false }
    if (/\.(?:mp4|m4v|webm|ogv|mov)$/i.test(url.pathname)) return { kind: "video", source: url.href, local: false }
    if (/\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(url.pathname)) return
    return { kind: "website", source: url.href, local: false }
  }
  const path = localImagePath(value)
  if (!path) return
  if (/\.(?:mp4|m4v|webm|ogv|mov)$/i.test(path)) return { kind: "video", source: path, local: true }
  if (/\.html?$/i.test(path)) return { kind: "html", source: path, local: true }
}

/** Load visible previews automatically while keeping generated documents in an opaque origin. */
export function createMarkdownReferencedMedia() {
  let cleanup: (() => void) | undefined
  let reader: ReadMarkdownPreview | undefined
  let activeSession: string | undefined
  let activeServer: string | undefined
  return {
    update(
      root: HTMLElement,
      read: ReadMarkdownPreview | undefined,
      enabled: boolean,
      open?: OpenMarkdownPreview,
      sessionID?: string,
      serverID?: string,
    ) {
      const previous = root.querySelector<HTMLElement>("[data-markdown-media-previews]")
      const entries = new Map<string, MediaReference>()
      if (enabled)
        root.querySelectorAll<HTMLElement>(":not(pre) > code, a[href], a[data-local-link]").forEach((node) => {
          if (node.closest("[data-markdown-media-previews]")) return
          const source =
            node instanceof HTMLAnchorElement ? (node.dataset.localLink ?? node.getAttribute("href")) : node.textContent
          if (!source) return
          const entry = markdownMediaReference(source)
          if (entry && (!entry.local || read)) entries.set(`${entry.kind}:${entry.source}`, entry)
        })
      if (enabled)
        root.querySelectorAll<HTMLElement>("pre > code.language-html").forEach((code) => {
          const source = code.textContent ?? ""
          if (source) entries.set(`html-code:${checksum(source)}`, { kind: "html-code", source, local: false })
        })
      const parent = root.lastElementChild
      const key = JSON.stringify([...entries.keys()])
      if (
        previous &&
        previous.parentElement === parent &&
        previous.dataset.sources === key &&
        reader === read &&
        activeSession === sessionID
        && activeServer === serverID
      )
        return
      cleanup?.()
      cleanup = undefined
      reader = read
      activeSession = sessionID
      activeServer = serverID
      previous?.remove()
      if (!parent || entries.size === 0) return
      const container = document.createElement("div")
      container.dataset.markdownMediaPreviews = ""
      container.dataset.sources = key
      const controller = new AbortController()
      const urls: string[] = []
      const observer = root.isConnected && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((items) => {
            items.forEach((item) => {
              if (!item.isIntersecting) return
              observer?.unobserve(item.target)
              item.target.dispatchEvent(new Event("preview-visible"))
            })
          }, { rootMargin: "200px" })
        : undefined
      cleanup = () => {
        observer?.disconnect()
        controller.abort()
        urls.forEach((url) => URL.revokeObjectURL(url))
      }
      entries.forEach((entry) => {
        const card = document.createElement("div")
        card.dataset.markdownMedia = entry.kind
        const button = document.createElement("button")
        button.type = "button"
        button.textContent =
          entry.kind === "youtube"
            ? "Reproduzir vídeo do YouTube"
            : entry.kind === "video"
              ? "Visualizar vídeo"
              : entry.kind === "html" || entry.kind === "html-code"
                ? "Visualizar HTML"
                : "Visualizar site"
        const name = document.createElement("span")
        name.textContent = entry.kind === "youtube" ? `YouTube · ${entry.source}` : entry.kind === "html-code" ? "Bloco HTML da conversa" : entry.source
        card.append(name, button)
        if (open && entry.kind !== "html-code")
          card.append(
            markdownPreviewActions(
              entry.kind === "youtube" ? `https://www.youtube.com/watch?v=${entry.source}` : entry.source,
              entry.local,
              open,
            ),
          )
        const load = async () => {
          if (button.disabled || controller.signal.aborted) return
          button.disabled = true
          card.setAttribute("aria-busy", "true")
          button.textContent = "Carregando…"
          try {
            const blob = entry.kind === "html-code" ? new Blob([entry.source], { type: "text/html" }) : entry.local ? await read?.(entry.source, controller.signal) : undefined
            if (controller.signal.aborted) return
            if (entry.local && !blob) throw new Error("Arquivo indisponível")
            const html = entry.kind === "html" || entry.kind === "html-code"
            const src = blob && !html ? URL.createObjectURL(blob) : entry.source
            if (blob && !html) urls.push(src)
            if (entry.kind === "video") {
              const video = document.createElement("video")
              video.controls = true
              video.preload = "metadata"
              video.src = src
              const viewer = document.createElement("div")
              viewer.dataset.previewViewer = ""
              viewer.append(video)
              button.remove()
              card.append(viewer)
              if (sessionID) card.append(markdownPreviewAnnotation(viewer, entry.source, sessionID, undefined, serverID))
              return
            }
            const frame = document.createElement("iframe")
            frame.title = entry.kind === "youtube" ? "Vídeo do YouTube" : entry.kind === "html-code" ? "Bloco HTML da conversa" : entry.source
            frame.setAttribute("sandbox", html ? "" : "allow-scripts allow-presentation")
            frame.setAttribute("referrerpolicy", "no-referrer")
            frame.allowFullscreen = true
            if (html && blob) frame.srcdoc = safeHtmlPreview(await blob.text())
            else frame.src = entry.kind === "youtube" ? `https://www.youtube-nocookie.com/embed/${entry.source}` : src
            if (controller.signal.aborted) return
            const viewer = document.createElement("div")
            viewer.dataset.previewViewer = ""
            viewer.append(frame)
            button.remove()
            card.append(viewer)
            if (sessionID)
              card.append(
                markdownPreviewAnnotation(
                  viewer,
                  entry.kind === "youtube" ? `https://www.youtube.com/watch?v=${entry.source}` : entry.kind === "html-code" ? "Bloco HTML da conversa" : entry.source,
                  sessionID,
                  entry.kind === "html" || entry.kind === "html-code" ? frame : undefined,
                  serverID,
                ),
              )
          } catch (error) {
            if (controller.signal.aborted) return
            button.disabled = false
            button.textContent = error instanceof Error ? `${error.message} Tentar novamente` : "Não foi possível carregar. Tentar novamente"
          } finally {
            card.removeAttribute("aria-busy")
          }
        }
        button.addEventListener("click", load)
        card.addEventListener("preview-visible", load, { once: true })
        container.append(card)
        if (observer) observer.observe(card)
        else void load()
      })
      parent.append(container)
    },
    dispose() {
      cleanup?.()
      cleanup = undefined
    },
  }
}
