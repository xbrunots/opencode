import { expect, test } from "bun:test"
import { transitionFloatingDrag, type FloatingDragState } from "./floating-drag-machine"

test("tracks one pointer and ignores stale movement or cancellation", () => {
  const idle: FloatingDragState = { type: "idle" }
  const dragging = transitionFloatingDrag(idle, { type: "started", pointer: 1, x: 10, y: 20, left: 30, top: 40 })
  expect(transitionFloatingDrag(dragging, { type: "moved", pointer: 2, x: 50, y: 60 })).toBe(dragging)
  expect(transitionFloatingDrag(dragging, { type: "cancelled", pointer: 2 })).toBe(dragging)
  const moved = transitionFloatingDrag(dragging, { type: "moved", pointer: 1, x: 50, y: 60 })
  expect(moved).toMatchObject({ type: "dragging", currentX: 50, currentY: 60 })
  expect(transitionFloatingDrag(moved, { type: "finished", pointer: 1 })).toEqual(idle)
  expect(transitionFloatingDrag(moved, { type: "cancelled", pointer: 1 })).toEqual(idle)
  expect(transitionFloatingDrag(moved, { type: "disposed" })).toEqual(idle)
})
