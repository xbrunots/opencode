import type { OpenMarkdownPreview } from "../context/markdown"

export function markdownPreviewActions(source: string, local: boolean, open?: OpenMarkdownPreview, edit?: () => void) {
  const menu = document.createElement("details")
  menu.dataset.markdownPreviewActions = ""
  const trigger = document.createElement("summary")
  trigger.setAttribute("aria-label", "Opções de prévia")
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  icon.setAttribute("viewBox", "0 0 24 24")
  icon.setAttribute("aria-hidden", "true")
  for (const x of [5, 12, 19]) {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle")
    dot.setAttribute("cx", String(x))
    dot.setAttribute("cy", "12")
    dot.setAttribute("r", "1.5")
    icon.append(dot)
  }
  trigger.append(icon)
  const list = document.createElement("div")
  // A gallery scrolls horizontally and clips descendants. A popover enters the browser's top layer
  // while remaining next to the trigger in the accessibility tree.
  list.setAttribute("popover", "auto")
  Object.assign(list.style, {
    boxSizing: "border-box",
    visibility: "hidden",
    minWidth: "min(210px, calc(100vw - 16px))",
    maxWidth: "calc(100vw - 16px)",
    maxHeight: "calc(100vh - 16px)",
    overflow: "auto",
  })
  let removal: MutationObserver | undefined
  const place = () => {
    const anchor = trigger.getBoundingClientRect()
    const box = list.getBoundingClientRect()
    const margin = 8
    const left = Math.max(margin, Math.min(anchor.right - box.width, window.innerWidth - box.width - margin))
    const below = anchor.bottom + 4
    const preferred = below + box.height <= window.innerHeight - margin ? below : anchor.top - box.height - 4
    const top = Math.max(margin, Math.min(preferred, window.innerHeight - box.height - margin))
    Object.assign(list.style, { position: "fixed", left: `${left}px`, top: `${top}px`, right: "auto", bottom: "auto", margin: "0" })
  }
  const stopPositioning = () => {
    window.removeEventListener("resize", place)
    window.removeEventListener("scroll", place, true)
    removal?.disconnect()
    removal = undefined
  }
  menu.addEventListener("toggle", () => {
    if (!menu.open) {
      stopPositioning()
      if (typeof list.hidePopover === "function" && list.matches(":popover-open")) list.hidePopover()
      delete list.dataset.positioned
      list.style.visibility = "hidden"
      return
    }
    if (typeof list.showPopover !== "function" || !menu.isConnected) return
    if (!list.matches(":popover-open")) list.showPopover()
    place()
    list.style.visibility = "visible"
    list.dataset.positioned = ""
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    removal = new MutationObserver(() => { if (!menu.isConnected) stopPositioning() })
    removal.observe(document.documentElement, { childList: true, subtree: true })
  })
  list.addEventListener("toggle", (event) => {
    if ((event as ToggleEvent).newState !== "closed") return
    stopPositioning()
    menu.open = false
  })
  if (edit) {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = "Editar"
    button.addEventListener("click", () => {
      menu.open = false
      edit()
    })
    list.append(button)
  }
  if (open) (
    [
      ["panel", "Abrir no painel direito"],
      ["system", local ? "Abrir no aplicativo padrão" : "Abrir no navegador padrão"],
    ] as const
  ).forEach(([destination, label]) => {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = label
    button.addEventListener("click", () => {
      menu.open = false
      open(source, local, destination)
    })
    list.append(button)
  })
  menu.append(trigger, list)
  return menu
}
