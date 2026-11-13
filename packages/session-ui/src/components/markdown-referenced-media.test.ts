import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createMarkdownReferencedMedia, markdownMediaReference } from "./markdown-referenced-media"

test("recognizes valid media without trusting a YouTube-like hostname", () => {
  expect(markdownMediaReference("https://youtu.be/abcdefghijk")).toEqual({
    kind: "youtube",
    source: "abcdefghijk",
    local: false,
  })
  expect(markdownMediaReference("https://youtube.com/watch?v=abcdefghijk")).toEqual({
    kind: "youtube",
    source: "abcdefghijk",
    local: false,
  })
  expect(markdownMediaReference("https://youtube.com.evil.test/watch?v=abcdefghijk")?.kind).toBe("website")
  expect(markdownMediaReference("./output/demo.mp4")?.kind).toBe("video")
  expect(markdownMediaReference("./output/index.html")?.kind).toBe("html")
  expect(markdownMediaReference("/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/")).toEqual({
    kind: "artifact",
    source: "/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/",
    local: true,
  })
  expect(markdownMediaReference("/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/other")).toBeUndefined()
  expect(markdownMediaReference("javascript:alert(1)")).toBeUndefined()
})

describe("markdown media previews", () => {
  beforeAll(() => GlobalRegistrator.register())
  afterAll(() => GlobalRegistrator.unregister())

  test("shows an artifact card without mounting an active HTML preview", async () => {
    const root = document.createElement("div")
    root.innerHTML = "<div><code>/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/</code></div>"
    const previews = createMarkdownReferencedMedia()
    const mounted: string[] = []
    const opened: unknown[] = []
    previews.update(root, async () => new Blob(["<h1>fallback</h1>"], { type: "text/html" }), true, (...args) => opened.push(args), "session", "server", (_target, source) => {
      mounted.push(source)
      return () => undefined
    })
    await Promise.resolve()
    expect(mounted).toEqual([])
    expect(root.querySelector("iframe")).toBeNull()
    root.querySelector<HTMLButtonElement>("[data-html-artifact-card]")!.click()
    expect(opened).toEqual([["/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/", true, "panel", undefined]])
    previews.dispose()
  })

  test("opens local HTML and published artifacts as cards without a fallback reader", () => {
    const root = document.createElement("div")
    root.innerHTML = "<div><code>effect.html</code><code>/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/</code></div>"
    const previews = createMarkdownReferencedMedia()
    const opened: unknown[] = []
    previews.update(root, undefined, true, (...args) => opened.push(args), "session", "server")
    root.querySelectorAll<HTMLButtonElement>("[data-html-artifact-card]").forEach((button) => button.click())
    expect(opened).toEqual([
      ["effect.html", true, "panel", undefined],
      ["/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/", true, "panel", undefined],
    ])
    expect(root.querySelector("iframe")).toBeNull()
    previews.dispose()
  })

  test("opens inline HTML through the panel without mounting or inventing a file path", () => {
    const root = document.createElement("div")
    root.innerHTML = '<div><pre><code class="language-html">&lt;h1&gt;Example&lt;/h1&gt;</code></pre></div>'
    const previews = createMarkdownReferencedMedia()
    const calls: unknown[] = []
    previews.update(root, undefined, true, (...args) => calls.push(args), "session", "server")
    root.querySelector<HTMLButtonElement>("[data-html-artifact-card]")!.click()
    expect(calls).toEqual([["Bloco HTML da conversa", false, "panel", "<h1>Example</h1>"]])
    expect(root.querySelector("iframe")).toBeNull()
    previews.dispose()
  })

  test("shows the size limit message in the chat when the reader rejects a preview", async () => {
    const root = document.createElement("div")
    root.innerHTML = "<div><code>large.mp4</code></div>"
    const previews = createMarkdownReferencedMedia()
    previews.update(root, async () => { throw new Error("O arquivo excede o limite de 32 MiB") }, true)
    const button = root.querySelector<HTMLButtonElement>("[data-markdown-media] > button")!
    await Promise.resolve()
    await Promise.resolve()
    expect(button.textContent).toContain("32 MiB")
    expect(button.disabled).toBe(false)
    previews.dispose()
  })
})
