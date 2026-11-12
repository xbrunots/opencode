import { expect, test } from "bun:test"
import { formatPreviewAnnotation, matchesAnnotationTarget } from "./annotation-target"

test("annotations require the server and session to match", () => {
  const target = { serverID: "server-a", sessionID: "shared-session" }
  expect(matchesAnnotationTarget({ serverID: "server-a", sessionID: "shared-session" }, target)).toBe(true)
  expect(matchesAnnotationTarget({ serverID: "server-b", sessionID: "shared-session" }, target)).toBe(false)
  expect(matchesAnnotationTarget({ sessionID: "shared-session" }, target)).toBe(false)
  expect(matchesAnnotationTarget({ serverID: "server-a", sessionID: "other" }, target)).toBe(false)
})

test("preview comments preserve element source and markup without inventing a line", () => {
  const note = { src: "effect.html", x: 25, y: 50, comment: "Move this", element: { selector: "h1.title", tag: "h1", html: "<h1 class=\"title\">Hello</h1>" } }
  expect(formatPreviewAnnotation(note)).toContain("element: h1.title")
  expect(formatPreviewAnnotation(note)).toContain(note.element.html)
  expect(formatPreviewAnnotation(note)).not.toContain("source:")
  expect(formatPreviewAnnotation({ ...note, element: { ...note.element, source: { path: "effect.html", line: 12 } } })).toContain("source: effect.html:12")
  expect(formatPreviewAnnotation({ ...note, element: { ...note.element, component: "Hero" } })).toContain("component: Hero")
  expect(formatPreviewAnnotation({ ...note, element: { ...note.element, source: { path: "effect.html", line: 12, confidence: "inferred" } } })).toContain("possible source: effect.html:12")
  expect(formatPreviewAnnotation({ ...note, file: { name: "element-2.png" } })).toContain("screenshot: element-2.png")
})
