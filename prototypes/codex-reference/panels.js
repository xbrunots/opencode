/* Interaction state is independent of the shell, which replaces its DOM on render. */
;(() => {
  const geometry = new Map()
  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max))
  const small = () => matchMedia("(max-width: 800px)").matches

  function mount({ root, mode, onOrder }) {
    const tabs = root.querySelectorAll(".tab-wrap[data-session]")
    tabs.forEach((tab) => {
      tab.draggable = true
      tab.addEventListener("dragstart", (event) => {
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData("text/plain", tab.dataset.session)
        tab.classList.add("tab-dragging")
      })
      tab.addEventListener("dragend", () => {
        root
          .querySelectorAll(".tab-drop-target,.tab-dragging")
          .forEach((element) => element.classList.remove("tab-drop-target", "tab-dragging"))
      })
      tab.addEventListener("dragover", (event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
        root.querySelectorAll(".tab-drop-target").forEach((element) => element.classList.remove("tab-drop-target"))
        tab.classList.add("tab-drop-target")
      })
      tab.addEventListener("dragleave", () => tab.classList.remove("tab-drop-target"))
      tab.addEventListener("drop", (event) => {
        event.preventDefault()
        const source = event.dataTransfer.getData("text/plain")
        const order = [...root.querySelectorAll(".tab-wrap[data-session]")].map((element) => element.dataset.session)
        const from = order.indexOf(source)
        const to = order.indexOf(tab.dataset.session)
        if (from < 0 || to < 0 || from === to) return
        order.splice(to, 0, order.splice(from, 1)[0])
        onOrder(order)
      })
      tab.querySelector('[role="tab"]')?.addEventListener("keydown", (event) => {
        if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return
        const order = [...root.querySelectorAll(".tab-wrap[data-session]")].map((element) => element.dataset.session)
        const from = order.indexOf(tab.dataset.session)
        const to = clamp(from + (event.key === "ArrowLeft" ? -1 : 1), 0, order.length - 1)
        if (from === to) return
        event.preventDefault()
        order.splice(to, 0, order.splice(from, 1)[0])
        onOrder(order)
        const next = [...root.querySelectorAll(".tab-wrap[data-session]")].find(
          (element) => element.dataset.session === tab.dataset.session,
        )
        next?.querySelector('[role="tab"]')?.focus()
      })
    })

    const canvas = root.querySelector(".island-view")
    if (mode !== "islands" || !canvas || small()) return
    const panels = [...canvas.querySelectorAll(".grid-panel[data-session]")]
    if (!panels.length) return
    const canvasWidth = canvas.clientWidth
    const columns = canvasWidth >= 1000 ? 2 : 1
    const width = Math.max(280, Math.floor((canvasWidth - (columns + 1) * 14) / columns))
    const height = 420
    const spacer = document.createElement("div")
    spacer.className = "island-canvas-spacer"
    spacer.style.height = `${Math.ceil(panels.length / columns) * (height + 14) + 14}px`
    canvas.prepend(spacer)

    panels.forEach((panel, index) => {
      const key = panel.dataset.session
      const initial = geometry.get(key) || {
        x: 14 + (index % columns) * (width + 14),
        y: 14 + Math.floor(index / columns) * (height + 14),
        width,
        height,
      }
      const constrain = (rect) => {
        const maxWidth = Math.max(280, canvas.clientWidth - 28)
        const maxHeight = Math.max(260, canvas.scrollHeight - 28)
        const nextWidth = clamp(rect.width, Math.min(300, maxWidth), maxWidth)
        const nextHeight = clamp(rect.height, Math.min(260, maxHeight), maxHeight)
        return {
          width: nextWidth,
          height: nextHeight,
          x: clamp(rect.x, 0, canvas.clientWidth - nextWidth),
          y: clamp(rect.y, 0, canvas.scrollHeight - nextHeight),
        }
      }
      const draw = (rect) => {
        const next = constrain(rect)
        Object.assign(panel.style, {
          left: `${next.x}px`,
          top: `${next.y}px`,
          width: `${next.width}px`,
          height: `${next.height}px`,
        })
        geometry.set(key, next)
      }
      draw(initial)
      const handle = panel.querySelector("[data-drag-handle]")
      const resize = document.createElement("button")
      resize.type = "button"
      resize.className = "island-resize"
      resize.setAttribute("aria-label", "Redimensionar painel com as setas")
      resize.title = "Arraste para redimensionar; use as setas no teclado"
      panel.append(resize)

      const start = (event, resizing) => {
        if (event.button !== 0 || small()) return
        if (!resizing && event.target.closest("button, a, input, textarea, select")) return
        event.preventDefault()
        const origin = geometry.get(key)
        const startX = event.clientX
        const startY = event.clientY
        const target = event.currentTarget
        target.setPointerCapture(event.pointerId)
        panel.classList.add("island-moving")
        const move = (moveEvent) => {
          const dx = moveEvent.clientX - startX
          const dy = moveEvent.clientY - startY
          draw(
            resizing
              ? { ...origin, width: origin.width + dx, height: origin.height + dy }
              : { ...origin, x: origin.x + dx, y: origin.y + dy },
          )
        }
        const end = () => {
          panel.classList.remove("island-moving")
          target.removeEventListener("pointermove", move)
          target.removeEventListener("pointerup", end)
          target.removeEventListener("pointercancel", end)
        }
        target.addEventListener("pointermove", move)
        target.addEventListener("pointerup", end)
        target.addEventListener("pointercancel", end)
      }
      handle?.addEventListener("pointerdown", (event) => start(event, false))
      resize.addEventListener("pointerdown", (event) => start(event, true))
      resize.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return
        event.preventDefault()
        const rect = geometry.get(key)
        const step = event.shiftKey ? 40 : 10
        draw({
          ...rect,
          width: rect.width + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
          height: rect.height + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0),
        })
      })
    })
  }

  window.Panels = { mount, reset: () => geometry.clear() }
})()
