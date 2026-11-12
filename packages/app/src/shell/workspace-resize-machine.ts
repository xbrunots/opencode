export type WorkspaceResizeState =
  | { type: "idle" }
  | { type: "dragging"; pointerID: number; origin: number; current: number; minimum: number; axis: "width" | "height" }
export type WorkspaceResizeEvent =
  | { type: "started"; pointerID: number; x: number; minimum: number; axis?: "width" | "height" }
  | { type: "moved"; pointerID: number; x: number }
  | { type: "finished"; pointerID: number }
  | { type: "cancelled"; pointerID: number }
  | { type: "disposed" }

export function transitionWorkspaceResize(
  state: WorkspaceResizeState,
  event: WorkspaceResizeEvent,
): { state: WorkspaceResizeState; width?: number; height?: number } {
  if (event.type === "started")
    return {
      state: {
        type: "dragging",
        pointerID: event.pointerID,
        origin: event.x,
        current: event.x,
        minimum: event.minimum,
        axis: event.axis ?? "width",
      } as WorkspaceResizeState,
    }
  if (state.type === "idle") return { state }
  if (event.type === "disposed" || (event.type === "cancelled" && event.pointerID === state.pointerID))
    return { state: { type: "idle" } as WorkspaceResizeState }
  if (event.type === "finished" && event.pointerID === state.pointerID)
    return {
      state: { type: "idle" },
      [state.axis]:
        state.current === state.origin
          ? undefined
          : Math.max(state.axis === "width" ? 300 : 360, Math.min(1600, state.minimum + state.current - state.origin)),
    }
  if (event.type === "moved" && event.pointerID === state.pointerID)
    return {
      state: { ...state, current: event.x },
      [state.axis]: Math.max(
        state.axis === "width" ? 300 : 360,
        Math.min(1600, state.minimum + event.x - state.origin),
      ),
    }
  return { state }
}
