import type { OpenMarkdownPreview } from "../context/markdown"

export function markdownPreviewActions(source: string, local: boolean, open: OpenMarkdownPreview) {
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
  ;(
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
