import { expect, test } from "bun:test"
import { floatingResizeBounds, transitionFloatingDrag, type FloatingDragState } from "./floating-drag-machine"

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

test("resizes from any edge while keeping the opposite edge fixed and respecting viewport limits", () => {
  const idle: FloatingDragState = { type: "idle" }
  const start = transitionFloatingDrag(idle, {
    type: "resize-started", pointer: 1, x: 200, y: 100, left: 200, top: 100, width: 340, height: 500, edge: "nw",
  })
  const moved = transitionFloatingDrag(start, { type: "moved", pointer: 1, x: 150, y: 60 })
  if (moved.type !== "resizing") throw new Error("Expected resize")
  expect(floatingResizeBounds(moved, 1000, 800)).toEqual({ left: 150, top: 60, width: 390, height: 540 })
  const clamped = transitionFloatingDrag(moved, { type: "moved", pointer: 1, x: 600, y: 700 })
  if (clamped.type !== "resizing") throw new Error("Expected resize")
  expect(floatingResizeBounds(clamped, 1000, 800)).toEqual({ left: 260, top: 280, width: 280, height: 320 })
  expect(transitionFloatingDrag(clamped, { type: "finished", pointer: 1 })).toEqual(idle)

  const southeast = transitionFloatingDrag(idle, {
    type: "resize-started", pointer: 2, x: 540, y: 600, left: 200, top: 100, width: 340, height: 500, edge: "se",
  })
  const expanded = transitionFloatingDrag(southeast, { type: "moved", pointer: 2, x: 1200, y: 1000 })
  if (expanded.type !== "resizing") throw new Error("Expected resize")
  expect(floatingResizeBounds(expanded, 1000, 800)).toEqual({ left: 200, top: 100, width: 800, height: 700 })
})
