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
  expect(transitionWorkspaceResize(second, { type: "moved", pointerID: 3, x: 2000 }).width).toBe(900)
  expect(transitionWorkspaceResize(second, { type: "disposed" }).state.type).toBe("idle")
})
