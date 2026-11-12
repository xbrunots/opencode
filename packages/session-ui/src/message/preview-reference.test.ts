import { describe, expect, test } from "bun:test"
import { messagePreviewMarkdown, messagePreviewReferences } from "./preview-reference"

describe("message preview references", () => {
  test("preserves sources from comments and deduplicates paths mentioned again", () => {
    const text = "[Preview: foto-bruno.jpg; x: 17.3%, y: 10.0%] remova o fundo de foto-bruno.jpg"
    expect(messagePreviewReferences(text)).toEqual(["foto-bruno.jpg"])
  })

  test("recognizes local HTML, video, published artifacts and image URLs", () => {
    const text = "Veja @effect.html, clips/demo.mp4, https://example.org/photo.png e /api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/"
    expect(messagePreviewReferences(text)).toEqual([
      "effect.html",
      "clips/demo.mp4",
      "https://example.org/photo.png",
      "/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/",
    ])
    expect(messagePreviewMarkdown("https://example.org/photo.png")).toContain("![photo.png]")
    expect(messagePreviewMarkdown("effect.html")).toBe("`effect.html`")
  })

  test("does not turn ordinary text or unsupported schemes into previews", () => {
    expect(messagePreviewReferences("Altere as cores deste componente.")).toEqual([])
    expect(messagePreviewReferences("[Preview: javascript:alert(1); x: 1.0%, y: 2.0%] ajuste")).toEqual([])
  })

  test("retains complete paths with spaces when marked as code or links", () => {
    expect(messagePreviewReferences("Veja `minhas imagens/foto bruno.jpg` e [o vídeo](<meus vídeos/apresentação final.mp4>)"))
      .toEqual(["minhas imagens/foto bruno.jpg", "meus vídeos/apresentação final.mp4"])
  })
})
