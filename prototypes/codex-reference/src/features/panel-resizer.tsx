import { useLayoutEffect, useRef, useState } from "react"
import "./panel-resizer.css"

type PanelResizerProps = {
  width: number
  onWidthChange: (width: number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function PanelResizer({ width, onWidthChange }: PanelResizerProps) {
  const element = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const [limits, setLimits] = useState({ min: 320, max: 1000 })
  const [resizing, setResizing] = useState(false)

  useLayoutEffect(() => {
    const parent = element.current?.parentElement
    if (!parent) return
    const measure = () =>
      setLimits({
        min: 320,
        max: Math.max(320, Math.floor(Math.min(parent.clientWidth * 0.7, parent.clientWidth - 352))),
      })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  function finish() {
    drag.current = null
    setResizing(false)
  }

  return (
    <div
      ref={element}
      role="separator"
      tabIndex={0}
      aria-label="Redimensionar painel de ferramentas"
      aria-orientation="vertical"
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={Math.round(clamp(width, limits.min, limits.max))}
      aria-valuetext={`${Math.round(clamp(width, limits.min, limits.max))} pixels`}
      className="panel-resizer"
      data-resizing={resizing || undefined}
      title="Arraste para redimensionar. Use as setas ou dê dois cliques para restaurar."
      onPointerDown={(event) => {
        if (event.button !== 0) return
        const panel = event.currentTarget.parentElement?.querySelector<HTMLElement>(".workspace-tools-panel")
        drag.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          width: panel?.getBoundingClientRect().width || width,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        setResizing(true)
        event.preventDefault()
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return
        onWidthChange(clamp(drag.current.width + drag.current.x - event.clientX, limits.min, limits.max))
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId)
        finish()
      }}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDoubleClick={(event) => {
        const parent = event.currentTarget.parentElement
        if (!parent) return
        onWidthChange(clamp(Math.round(parent.clientWidth * 0.48), limits.min, limits.max))
      }}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        const step = event.shiftKey ? 32 : 16
        const next =
          event.key === "Home"
            ? limits.min
            : event.key === "End"
              ? limits.max
              : clamp(width, limits.min, limits.max) + (event.key === "ArrowLeft" ? step : -step)
        onWidthChange(clamp(next, limits.min, limits.max))
      }}
    />
  )
}
