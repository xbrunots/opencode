import { expect, sourceURL, story } from "../../stories/playwright/story"

const fixture = sourceURL(new URL("./markdown.fixture.tsx", import.meta.url))

story(
  "local HTML preview stays script-disabled and sends the clicked element to the conversation",
  async ({ page, mount }) => {
    await mount("components-markdown--complete-response")
    await page.evaluate(async (fixture) => {
      const { mountMarkdown } = await import(fixture)
      window.addEventListener("opencode:image-annotation", (event) => {
        document.body.dataset.previewAnnotation = JSON.stringify((event as CustomEvent).detail)
      event.preventDefault()
      })
      await mountMarkdown({ text: "`out/index.html`", previews: true })
    }, fixture)
    const harness = page.getByTestId("markdown-fixture")
    await harness.getByText("Visualizar HTML").click()
    const frame = harness.locator("iframe")
    await expect(frame).toHaveAttribute("sandbox", "allow-same-origin")
    await expect(frame.contentFrame().locator("#target")).toBeVisible()
    await harness.getByText("Comentar ponto").click()
    await harness.locator("[data-preview-annotation-layer]").click({ position: { x: 50, y: 50 } })
    await harness.getByLabel("Comentário sobre a prévia").fill("Ajuste este elemento")
    await harness.getByText("Adicionar à mensagem").click()
    const result = await page.locator("body").getAttribute("data-preview-annotation")
    expect(JSON.parse(result!)).toMatchObject({
      sessionID: "fixture-session",
      src: "out/index.html",
      element: "div#target",
      comment: "Ajuste este elemento",
    })
    await expect(page.locator("body")).not.toHaveAttribute("data-preview-script", "ran")
    await harness.getByLabel("Opções de prévia").click()
    await harness.getByText("Abrir no painel direito").click()
    await expect(page.locator("body")).toHaveAttribute("data-preview-open", "out/index.html:true:panel")
  },
)
