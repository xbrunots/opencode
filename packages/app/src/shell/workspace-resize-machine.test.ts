import { expect, test } from "bun:test"
import { transitionWorkspaceResize, type WorkspaceResizeState } from "./workspace-resize-machine"

test("a completed island resize rejects stale pointer movements and starts the next drag from its own width", () => {
  const idle: WorkspaceResizeState = { type: "idle" }
  const first = transitionWorkspaceResize(idle, { type: "started", pointerID: 1, x: 500, minimum: 400 }).state
  expect(transitionWorkspaceResize(first, { type: "moved", pointerID: 2, x: 800 })).toEqual({ state: first })
  expect(transitionWorkspaceResize(first, { type: "moved", pointerID: 1, x: 560 }).width).toBe(460)
  const completed = transitionWorkspaceResize(first, { type: "finished", pointerID: 1 }).state
  expect(completed.type).toBe("idle")
  expect(transitionWorkspaceResize(completed, { type: "moved", pointerID: 1, x: 1000 }).state).toBe(completed)
  const second = transitionWorkspaceResize(completed, { type: "started", pointerID: 3, x: 300, minimum: 460 }).state
  expect(transitionWorkspaceResize(second, { type: "moved", pointerID: 3, x: -1000 }).width).toBe(300)
  expect(transitionWorkspaceResize(second, { type: "moved", pointerID: 3, x: 2000 }).width).toBe(1600)
  expect(transitionWorkspaceResize(second, { type: "disposed" }).state.type).toBe("idle")
})

test("vertical resize shares the same pointer lifecycle and clamps the row height", () => {
  const dragging = transitionWorkspaceResize(
    { type: "idle" },
    { type: "started", pointerID: 8, x: 700, minimum: 600, axis: "height" },
  ).state
  expect(transitionWorkspaceResize(dragging, { type: "moved", pointerID: 8, x: 820 }).height).toBe(720)
  expect(transitionWorkspaceResize(dragging, { type: "moved", pointerID: 9, x: 1000 })).toEqual({ state: dragging })
  expect(transitionWorkspaceResize(dragging, { type: "moved", pointerID: 8, x: 0 }).height).toBe(360)
  expect(transitionWorkspaceResize(dragging, { type: "disposed" }).state.type).toBe("idle")
})

test("preview commits the last dimension only on release and cancellation rejects stale pointers", () => {
  const dragging = transitionWorkspaceResize(
    { type: "idle" },
    { type: "started", pointerID: 4, x: 100, minimum: 320 },
  ).state
  expect(transitionWorkspaceResize(dragging, { type: "finished", pointerID: 4 }).width).toBeUndefined()
  const preview = transitionWorkspaceResize(dragging, { type: "moved", pointerID: 4, x: 180 }).state
  expect(transitionWorkspaceResize(preview, { type: "finished", pointerID: 4 }).width).toBe(400)
  expect(transitionWorkspaceResize(preview, { type: "cancelled", pointerID: 3 }).state).toBe(preview)
  expect(transitionWorkspaceResize(preview, { type: "cancelled", pointerID: 4 })).toEqual({ state: { type: "idle" } })
})
