export type FloatingResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

export type FloatingDragState =
  | { type: "idle" }
  | {
      type: "dragging"
      pointer: number
      x: number
      y: number
      left: number
      top: number
      currentX: number
      currentY: number
    }
  | {
      type: "resizing"
      pointer: number
      x: number
      y: number
      left: number
      top: number
      width: number
      height: number
      edge: FloatingResizeEdge
      currentX: number
      currentY: number
    }

export type FloatingDragEvent =
  | { type: "started"; pointer: number; x: number; y: number; left: number; top: number }
  | { type: "resize-started"; pointer: number; x: number; y: number; left: number; top: number; width: number; height: number; edge: FloatingResizeEdge }
  | { type: "moved"; pointer: number; x: number; y: number }
  | { type: "finished"; pointer: number }
  | { type: "cancelled"; pointer: number }
  | { type: "disposed" }

export function transitionFloatingDrag(state: FloatingDragState, event: FloatingDragEvent): FloatingDragState {
  if (event.type === "disposed") return state.type === "idle" ? state : { type: "idle" }
  if (event.type === "resize-started") {
    if (state.type !== "idle") return state
    return { ...event, type: "resizing", currentX: event.x, currentY: event.y }
  }
  if (event.type === "started") {
    if (state.type !== "idle") return state
    return {
      type: "dragging",
      pointer: event.pointer,
      x: event.x,
      y: event.y,
      left: event.left,
      top: event.top,
      currentX: event.x,
      currentY: event.y,
    }
  }
  if (state.type === "idle" || state.pointer !== event.pointer) return state
  if (event.type === "finished" || event.type === "cancelled") return { type: "idle" }
  if (state.currentX === event.x && state.currentY === event.y) return state
  return { ...state, currentX: event.x, currentY: event.y }
}

export function floatingResizeBounds(state: Extract<FloatingDragState, { type: "resizing" }>, width: number, height: number) {
  const minWidth = Math.min(280, width - 16)
  const minHeight = Math.min(320, height - 16)
  const right = state.left + state.width
  const bottom = state.top + state.height
  const dx = state.currentX - state.x
  const dy = state.currentY - state.y
  const left = state.edge.includes("w") ? Math.max(0, Math.min(right - minWidth, state.left + dx)) : state.left
  const top = state.edge.includes("n") ? Math.max(0, Math.min(bottom - minHeight, state.top + dy)) : state.top
  return {
    left,
    top,
    width: state.edge.includes("e") ? Math.max(minWidth, Math.min(width - left, state.width + dx)) : right - left,
    height: state.edge.includes("s") ? Math.max(minHeight, Math.min(height - top, state.height + dy)) : bottom - top,
  }
}
