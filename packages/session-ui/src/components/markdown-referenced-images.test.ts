import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { syncMarkdownReferencedImages } from "./markdown-referenced-images"

describe("markdown referenced image gallery", () => {
  beforeAll(() => GlobalRegistrator.register())
  afterAll(() => GlobalRegistrator.unregister())

  test("collects local paths in tables and lists, preserving original text and deduplicating images", () => {
    const root = document.createElement("div")
    root.innerHTML = `<div><table><tr><td><code>images/one.png</code></td></tr></table>
      <ul><li><code>images/two.jpg</code></li><li><code>images/one.png</code></li></ul>
      <pre><code>images/ignored.png</code></pre><a href="https://example.com/remote.png">remote</a>
      <a data-local-link="images/three.png">third image</a></div>`
    syncMarkdownReferencedImages(root, true)

    const images = [...root.querySelectorAll<HTMLImageElement>("[data-markdown-image-gallery] img")]
    expect(images.map((image) => image.dataset.localImage)).toEqual([
      "images/one.png",
      "images/two.jpg",
      "images/three.png",
    ])
    expect(root.querySelector("table code")?.textContent).toBe("images/one.png")
    syncMarkdownReferencedImages(root, true)
    expect(root.querySelector("[data-markdown-image-gallery] img")).toBe(images[0])
    syncMarkdownReferencedImages(root, false)
    expect(root.querySelector("[data-markdown-image-gallery]")).toBeNull()
  })
})
