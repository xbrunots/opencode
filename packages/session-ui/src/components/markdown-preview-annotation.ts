/** Add point comments without granting a previewed document access to the app or its composer. */
export function markdownPreviewAnnotation(
  viewer: HTMLElement,
  source: string,
  sessionID: string,
  html?: HTMLIFrameElement,
) {
  const action = document.createElement("button")
  action.type = "button"
  action.textContent = "Comentar ponto"
  const layer = document.createElement("div")
  layer.dataset.previewAnnotationLayer = ""
  layer.hidden = true
  const help = document.createElement("span")
  help.textContent = "Clique no ponto que deseja comentar"
  layer.append(help)
  viewer.append(layer)
  action.addEventListener("click", () => {
    layer.hidden = !layer.hidden
    action.textContent = layer.hidden ? "Comentar ponto" : "Cancelar comentário"
  })
  layer.addEventListener("click", (event) => {
    if (event.target !== layer && event.target !== help) return
    const bounds = layer.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100))
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100))
    const element = html ? previewElement(html, event.clientX - bounds.left, event.clientY - bounds.top) : undefined
    const form = document.createElement("form")
    form.dataset.previewAnnotationForm = ""
    const text = document.createElement("textarea")
    text.placeholder = "Escreva um comentário…"
    text.setAttribute("aria-label", "Comentário sobre a prévia")
    const submit = document.createElement("button")
    submit.type = "submit"
    submit.textContent = "Adicionar à mensagem"
    const error = document.createElement("span")
    error.setAttribute("role", "alert")
    form.append(text, error, submit)
    layer.replaceChildren(form)
    text.focus()
    form.addEventListener("submit", (submitEvent) => {
      submitEvent.preventDefault()
      const comment = text.value.trim()
      if (!comment) return
      const delivered = new CustomEvent("opencode:image-annotation", {
        cancelable: true,
        detail: {
          sessionID, src: source, x, y, comment,
          ...(element ? { element } : {}),
          ...(viewer.querySelector("video") ? { time: viewer.querySelector("video")!.currentTime } : {}),
        },
      })
      window.dispatchEvent(delivered)
      if (!delivered.defaultPrevented) {
        error.textContent = "Não foi possível adicionar o comentário. Abra a conversa e tente novamente."
        return
      }
      layer.hidden = true
      layer.replaceChildren(help)
      action.textContent = "Comentar ponto"
    })
  })
  return action
}

function previewElement(frame: HTMLIFrameElement, x: number, y: number) {
  // Access is available only for the local script-disabled HTML frame; navigation to another origin is opaque.
  const node = frame.contentDocument?.elementFromPoint?.(x, y)
  if (!node) return
  const segments: string[] = []
  let current: Element | null = node
  while (current && segments.length < 5) {
    const tag = current.tagName.toLowerCase()
    if (current.id) {
      segments.unshift(`${tag}#${CSS.escape(current.id)}`)
      break
    }
    const parent: Element | null = current.parentElement
    const siblings = parent ? Array.from(parent.children).filter((item) => item.tagName === current?.tagName) : []
    segments.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(current) + 1})` : tag)
    current = parent
  }
  return segments.join(" > ")
}
