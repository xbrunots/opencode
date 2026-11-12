import { localImagePath } from "./markdown-image"
import { markdownPreviewActions } from "./markdown-preview-actions"
import type { OpenMarkdownPreview } from "../context/markdown"

const IMAGE_PATH = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i

/** Shows local images named in inline paths and table links without replacing the original text. */
export function syncMarkdownReferencedImages(root: HTMLElement, enabled: boolean, open?: OpenMarkdownPreview) {
  const gallery = root.querySelector<HTMLElement>("[data-markdown-image-gallery]")
  if (!enabled) return gallery?.remove()

  const paths = new Set<string>()
  root.querySelectorAll<HTMLElement>(":not(pre) > code, a[href], a[data-local-link]").forEach((node) => {
    if (node.closest("[data-markdown-image-gallery]")) return
    const source =
      node instanceof HTMLAnchorElement ? (node.dataset.localLink ?? node.getAttribute("href")) : node.textContent
    if (!source || !IMAGE_PATH.test(source.trim())) return
    const path = localImagePath(source)
    if (path) paths.add(path)
  })

  const parent = root.lastElementChild
  if (!parent || paths.size === 0) return gallery?.remove()
  const key = JSON.stringify([...paths])
  if (gallery?.parentElement === parent && gallery.dataset.paths === key) return
  gallery?.remove()

  const next = document.createElement("div")
  next.dataset.markdownImageGallery = ""
  next.dataset.paths = key
  next.setAttribute("aria-label", "Imagens referenciadas")
  paths.forEach((path) => {
    const image = document.createElement("img")
    image.dataset.localImage = path
    image.alt = path.split(/[\\/]/).pop() || path
    image.addEventListener("load", () => (image.dataset.loaded = ""))
    image.addEventListener("error", () => delete image.dataset.loaded)
    const item = document.createElement("div")
    item.dataset.markdownImageItem = ""
    item.append(image)
    if (open) item.append(markdownPreviewActions(path, true, open))
    next.append(item)
  })
  parent.append(next)
}
