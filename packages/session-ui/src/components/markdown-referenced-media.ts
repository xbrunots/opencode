import { localImagePath } from "./markdown-image"
import type { OpenMarkdownPreview, ReadMarkdownPreview, RenderMarkdownPreview } from "../context/markdown"
import { markdownPreviewActions } from "./markdown-preview-actions"
import { markdownPreviewAnnotation } from "./markdown-preview-annotation"
import { checksum } from "@opencode/util/encode"

type MediaReference = { kind: "youtube" | "video" | "html" | "html-code" | "artifact" | "website"; source: string; local: boolean }

export function markdownMediaReference(source: string): MediaReference | undefined {
  const value = source.trim()
  if (!value) return
  if (/^\/api\/experimental\/artifacts\/art_[a-zA-Z0-9]{26}\/view\/?$/.test(value))
    return { kind: "artifact", source: value.endsWith("/") ? value : `${value}/`, local: true }
  if (/^https?:\/\//i.test(value)) {
    if (!URL.canParse(value)) return
    const url = new URL(value)
    if (!["http:", "https:"].includes(url.protocol)) return
    if (!url.username && !url.password && !url.search && !url.hash && /^\/api\/experimental\/artifacts\/art_[a-zA-Z0-9]{26}\/view\/?$/.test(url.pathname))
      return { kind: "artifact", source: url.href.endsWith("/") ? url.href : `${url.href}/`, local: true }
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
  let renderer: RenderMarkdownPreview | undefined
  return {
    update(
      root: HTMLElement,
      read: ReadMarkdownPreview | undefined,
      enabled: boolean,
      open?: OpenMarkdownPreview,
      sessionID?: string,
      serverID?: string,
      renderPreview?: RenderMarkdownPreview,
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
          if (entry && (!entry.local || read || ((renderPreview || open) && (entry.kind === "html" || entry.kind === "artifact"))))
            entries.set(`${entry.kind}:${entry.source}`, entry)
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
        && renderer === renderPreview
      )
        return
      cleanup?.()
      cleanup = undefined
      reader = read
      activeSession = sessionID
      activeServer = serverID
      renderer = renderPreview
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
        if (entry.kind === "html" || entry.kind === "html-code" || entry.kind === "artifact" || entry.kind === "website") {
          const button = document.createElement("button")
          button.type = "button"
          button.dataset.htmlArtifactCard = ""
          button.disabled = !open
          const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg")
          icon.setAttribute("viewBox", "0 0 24 24")
          icon.setAttribute("aria-hidden", "true")
          icon.innerHTML = '<path d="M8 8 4 12l4 4m8-8 4 4-4 4m-3-11-2 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
          const content = document.createElement("span")
          const label = document.createElement("strong")
          label.textContent = entry.kind === "html-code" ? "Bloco HTML da conversa" : entry.source
          const hint = document.createElement("span")
          hint.textContent = "Abrir no painel direito"
          content.append(label, hint)
          const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg")
          arrow.setAttribute("aria-hidden", "true")
          arrow.setAttribute("viewBox", "0 0 24 24")
          arrow.innerHTML = '<path d="M7 17 17 7M8 7h9v9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
          button.append(icon, content, arrow)
          button.addEventListener("click", () => open?.(
            entry.kind === "html-code" ? "Bloco HTML da conversa" : entry.source,
            entry.local,
            "panel",
            entry.kind === "html-code" ? entry.source : undefined,
          ))
          card.append(button)
          const actions = entry.kind === "artifact" && open
            ? markdownPreviewActions(entry.source, entry.local, open)
            : undefined
          if (actions) card.append(actions)
          container.append(card)
          if (entry.kind === "artifact" && read) {
            const loadMedia = async () => {
              try {
                const blob = await read(entry.source, controller.signal, sessionID)
                if (!blob || controller.signal.aborted || (!blob.type.startsWith("image/") && !blob.type.startsWith("video/"))) return
                const src = URL.createObjectURL(blob)
                urls.push(src)
                const viewer = document.createElement("div")
                viewer.dataset.previewViewer = ""
                if (blob.type.startsWith("image/")) {
                  const image = document.createElement("img")
                  image.src = src
                  image.alt = entry.source
                  viewer.append(image)
                } else {
                  const video = document.createElement("video")
                  video.controls = true
                  video.preload = "metadata"
                  video.src = src
                  viewer.append(video)
                }
                card.replaceChildren(viewer)
                if (sessionID) card.append(markdownPreviewAnnotation(viewer, entry.source, sessionID, undefined, serverID))
                if (actions) card.append(actions)
              } catch {
                // Keep the card available: opening the panel reports an unavailable artifact.
              }
            }
            card.addEventListener("preview-visible", () => void loadMedia(), { once: true })
            if (observer) observer.observe(card)
            else void loadMedia()
          }
          return
        }
        const button = document.createElement("button")
        button.type = "button"
        button.textContent = entry.kind === "youtube" ? "Reproduzir vídeo do YouTube" : "Visualizar vídeo"
        const name = document.createElement("span")
        name.textContent = entry.kind === "youtube" ? `YouTube · ${entry.source}` : entry.source
        card.append(name, button)
        if (open)
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
            const blob = entry.local ? await read?.(entry.source, controller.signal, sessionID) : undefined
            if (controller.signal.aborted) return
            if (entry.local && !blob) throw new Error("Arquivo indisponível")
            const src = blob ? URL.createObjectURL(blob) : entry.source
            if (blob) urls.push(src)
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
            frame.title = entry.kind === "youtube" ? "Vídeo do YouTube" : entry.source
            frame.setAttribute("sandbox", "allow-scripts allow-presentation")
            frame.setAttribute("referrerpolicy", "no-referrer")
            frame.allowFullscreen = true
            frame.src = entry.kind === "youtube" ? `https://www.youtube-nocookie.com/embed/${entry.source}` : src
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
                  entry.kind === "youtube" ? `https://www.youtube.com/watch?v=${entry.source}` : entry.source,
                  sessionID,
                  undefined,
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
        button.addEventListener("click", () => void load())
        card.addEventListener("preview-visible", () => void load(), { once: true })
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
