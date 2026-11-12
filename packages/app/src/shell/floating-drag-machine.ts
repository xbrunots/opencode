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

export type FloatingDragEvent =
  | { type: "started"; pointer: number; x: number; y: number; left: number; top: number }
  | { type: "moved"; pointer: number; x: number; y: number }
  | { type: "finished"; pointer: number }
  | { type: "cancelled"; pointer: number }
  | { type: "disposed" }

export function transitionFloatingDrag(state: FloatingDragState, event: FloatingDragEvent): FloatingDragState {
  if (event.type === "disposed") return state.type === "idle" ? state : { type: "idle" }
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
