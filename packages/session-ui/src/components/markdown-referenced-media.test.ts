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
  expect(markdownMediaReference("javascript:alert(1)")).toBeUndefined()
})

describe("markdown media previews", () => {
  beforeAll(() => GlobalRegistrator.register())
  afterAll(() => GlobalRegistrator.unregister())

  test("reads a referenced HTML file only on request and renders it in a script-disabled sandbox", async () => {
    const root = document.createElement("div")
    root.innerHTML = "<div><code>out/index.html</code></div>"
    const calls: string[] = []
    const previews = createMarkdownReferencedMedia()
    previews.update(
      root,
      async (path) => {
        calls.push(path)
        return new Blob(["<script>throw 1</script><h1>Preview</h1>"], { type: "text/html" })
      },
      true,
    )
    expect(calls).toEqual([])
    root.querySelector<HTMLButtonElement>("button")!.click()
    await Promise.resolve()
    await Promise.resolve()
    const frame = root.querySelector("iframe")
    expect(calls).toEqual(["out/index.html"])
    expect(frame?.getAttribute("sandbox")).toBe("allow-same-origin")
    expect(frame?.src).toStartWith("blob:")
    previews.dispose()
  })

  test("opens a preview in the chosen destination and sends a point comment to the matching session", async () => {
    const root = document.createElement("div")
    root.innerHTML = "<div><code>out/demo.html</code></div>"
    const opened: string[] = []
    const comments: unknown[] = []
    const listener = (event: Event) => {
      comments.push((event as CustomEvent).detail)
      event.preventDefault()
    }
    window.addEventListener("opencode:image-annotation", listener)
    const previews = createMarkdownReferencedMedia()
    previews.update(
      root,
      async () => new Blob(["<h1>Hello</h1>"], { type: "text/html" }),
      true,
      (source, local, destination) => opened.push(`${source}:${local}:${destination}`),
      "session-123",
    )
    root.querySelector<HTMLButtonElement>("[data-markdown-preview-actions] button")!.click()
    expect(opened).toEqual(["out/demo.html:true:panel"])
    root.querySelector<HTMLButtonElement>("[data-markdown-media] > button")!.click()
    await Promise.resolve()
    await Promise.resolve()
    root.querySelector<HTMLButtonElement>("[data-markdown-media] > button")!.click()
    const layer = root.querySelector<HTMLElement>("[data-preview-annotation-layer]")!
    layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    layer.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 75 }))
    root.querySelector<HTMLTextAreaElement>("textarea")!.value = "Ajustar aqui"
    root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    expect(comments).toEqual([
      { sessionID: "session-123", src: "out/demo.html", x: 25, y: 75, comment: "Ajustar aqui" },
    ])
    previews.dispose()
    window.removeEventListener("opencode:image-annotation", listener)
  })

  test("retains an annotation when no composer accepts it", async () => {
    const root = document.createElement("div")
    root.innerHTML = "<div><code>out/demo.html</code></div>"
    const previews = createMarkdownReferencedMedia()
    previews.update(root, async () => new Blob(["test"], { type: "text/html" }), true, undefined, "missing-session")
    root.querySelector<HTMLButtonElement>("[data-markdown-media] > button")!.click()
    await Promise.resolve()
    await Promise.resolve()
    root.querySelector<HTMLButtonElement>("[data-markdown-media] > button")!.click()
    const layer = root.querySelector<HTMLElement>("[data-preview-annotation-layer]")!
    layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect
    layer.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 50 }))
    const text = root.querySelector<HTMLTextAreaElement>("textarea")!
    text.value = "Não perder este comentário"
    root.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    expect(text.value).toBe("Não perder este comentário")
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Não foi possível")
    expect(layer.hidden).toBe(false)
    previews.dispose()
  })

  test("renders HTML code blocks in a script-disabled preview while keeping their source", async () => {
    const root = document.createElement("div")
    root.innerHTML = '<div><pre><code class="language-html">&lt;h1&gt;Example&lt;/h1&gt;</code></pre></div>'
    const previews = createMarkdownReferencedMedia()
    previews.update(root, undefined, true, undefined, "session-123")
    root.querySelector<HTMLButtonElement>("[data-markdown-media] > button")!.click()
    await Promise.resolve()
    expect(root.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-same-origin")
    expect(root.querySelector("pre code")?.textContent).toBe("<h1>Example</h1>")
    previews.dispose()
  })

  test("shows the size limit message in the chat when the reader rejects a preview", async () => {
    const root = document.createElement("div")
    root.innerHTML = "<div><code>large.mp4</code></div>"
    const previews = createMarkdownReferencedMedia()
    previews.update(root, async () => { throw new Error("O arquivo excede o limite de 32 MiB") }, true)
    const button = root.querySelector<HTMLButtonElement>("[data-markdown-media] > button")!
    button.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(button.textContent).toContain("32 MiB")
    expect(button.disabled).toBe(false)
    previews.dispose()
  })
})
