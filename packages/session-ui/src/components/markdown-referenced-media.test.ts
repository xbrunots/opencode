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

  test("mounts an interactive artifact preview and disposes it with the message", async () => {
    const root = document.createElement("div")
    root.innerHTML = "<div><code>/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/</code></div>"
    const previews = createMarkdownReferencedMedia()
    const mounted: string[] = []
    let disposed = false
    previews.update(root, async () => new Blob(["<h1>fallback</h1>"], { type: "text/html" }), true, undefined, "session", "server", (target, source) => {
      mounted.push(source)
      target.textContent = "Interactive preview"
      return () => { disposed = true }
    })
    expect(mounted).toEqual(["/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/"])
    expect(root.querySelector("[data-preview-viewer]")?.textContent).toBe("Interactive preview")
    previews.dispose()
    expect(disposed).toBe(true)
  })

  test("mounts local HTML and published artifacts with a native renderer even without a fallback reader", () => {
    const root = document.createElement("div")
    root.innerHTML = "<div><code>effect.html</code><code>/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/</code></div>"
    const previews = createMarkdownReferencedMedia()
    const mounted: string[] = []
    previews.update(root, undefined, true, undefined, "session", "server", (_target, source) => {
      mounted.push(source)
      return () => undefined
    })
    expect(mounted).toEqual(["effect.html", "/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/"])
    previews.dispose()
  })

  test("passes inline HTML to the native preview without inventing a file path", () => {
    const root = document.createElement("div")
    root.innerHTML = '<div><pre><code class="language-html">&lt;h1&gt;Example&lt;/h1&gt;</code></pre></div>'
    const previews = createMarkdownReferencedMedia()
    const calls: Array<{ source: string; html?: string }> = []
    previews.update(root, undefined, true, undefined, "session", "server", (_target, source, _fallback, html) => {
      calls.push({ source, html })
      return () => undefined
    })
    expect(calls).toEqual([{ source: "Bloco HTML da conversa", html: "<h1>Example</h1>" }])
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
