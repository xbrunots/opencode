export type WorkspaceResizeState =
  | { type: "idle" }
  | { type: "dragging"; pointerID: number; origin: number; minimum: number }
export type WorkspaceResizeEvent =
  | { type: "started"; pointerID: number; x: number; minimum: number }
  | { type: "moved"; pointerID: number; x: number }
  | { type: "finished"; pointerID: number }
  | { type: "disposed" }

export function transitionWorkspaceResize(state: WorkspaceResizeState, event: WorkspaceResizeEvent) {
  if (event.type === "started")
    return {
      state: {
        type: "dragging",
        pointerID: event.pointerID,
        origin: event.x,
        minimum: event.minimum,
      } as WorkspaceResizeState,
    }
  if (state.type === "idle") return { state }
  if (event.type === "disposed" || (event.type === "finished" && event.pointerID === state.pointerID))
    return { state: { type: "idle" } as WorkspaceResizeState }
  if (event.type === "moved" && event.pointerID === state.pointerID)
    return { state, width: Math.max(300, Math.min(900, state.minimum + event.x - state.origin)) }
  return { state }
}
