import { expect, test } from "bun:test"
import { previewSourceLine } from "./preview-source"

test("locates only uniquely matching source elements", () => {
  const source = `<!doctype html>
<html><body>
  <h1 id="title">Hello</h1>
  <span>Repeated</span><span>Repeated</span>
  <script>document.body.innerHTML += '<p>generated</p>'</script>
</body></html>`

  expect(previewSourceLine(source, '<h1 id="title">Hello</h1>')).toEqual({ line: 3, confidence: "exact" })
  expect(previewSourceLine(source, "<span>Repeated</span>")).toBeUndefined()
  expect(previewSourceLine(source, "<p>generated</p>")).toBeUndefined()
  expect(previewSourceLine(source, '<h1 id="title">Changed</h1>')).toBeUndefined()
  expect(previewSourceLine(source, '<h1 id="title">Changed</h1>', "h1", "title")).toEqual({ line: 3, confidence: "inferred" })
  // A generated replacement with the same ID can only imply a possible origin, never prove it.
  expect(previewSourceLine(source, '<h1 id="title">Replaced by JS</h1>', "h1", "title")).toEqual({ line: 3, confidence: "inferred" })
  expect(previewSourceLine(source, '<h1 id="dynamic">Changed</h1>', "h1", "dynamic")).toBeUndefined()
  expect(previewSourceLine('<div id="dup"></div><span id="dup"></span>', '<div id="dup">Changed</div>', "div", "dup")).toBeUndefined()
})
