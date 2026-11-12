import { expect, sourceURL, story } from "../../stories/playwright/story"

const fixture = sourceURL(new URL("./markdown.fixture.tsx", import.meta.url))

story("HTML blocks retain their code and fit narrow and wide chat views", async ({ page, mount }, testInfo) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: "```html\n<h1 id=\"target\">Exemplo</h1>\n```", previews: true })
  }, fixture)
  const harness = page.getByTestId("markdown-fixture")
  await harness.getByText("Visualizar HTML").click()
  await expect(harness.locator("pre code")).toContainText("Exemplo")
  await expect(harness.locator("iframe")).toHaveAttribute("sandbox", "allow-same-origin")
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 })
    const iframe = await harness.locator("iframe").boundingBox()
    expect(iframe).not.toBeNull()
    expect(iframe!.x + iframe!.width).toBeLessThanOrEqual(width + 1)
    await harness.scrollIntoViewIfNeeded()
    await harness.screenshot({ path: testInfo.outputPath(`html-${width}.png`) })
  }
})

story("attached video controls and annotations fit narrow and wide chat views", async ({ page, mount }, testInfo) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountVideoAttachment } = await import(fixture)
    mountVideoAttachment()
  }, fixture)
  const harness = page.getByTestId("video-fixture")
  await expect(harness.locator("video")).toBeVisible()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 })
    const video = await harness.locator("video").boundingBox()
    expect(video).not.toBeNull()
    expect(video!.x + video!.width).toBeLessThanOrEqual(width + 1)
    await expect(harness.getByText("Comentar ponto")).toBeVisible()
    await harness.scrollIntoViewIfNeeded()
    await harness.screenshot({ path: testInfo.outputPath(`video-${width}.png`) })
  }
  await harness.getByText("Comentar ponto").click()
  await harness.locator("[data-preview-annotation-layer]").click({ position: { x: 20, y: 20 } })
  await harness.getByLabel("Comentário sobre a prévia").fill("Ajustar vídeo")
  await harness.getByText("Adicionar à mensagem").click()
  await expect(harness.getByRole("alert")).toContainText("Não foi possível")
  await expect(harness.getByLabel("Comentário sobre a prévia")).toHaveValue("Ajustar vídeo")
  await harness.screenshot({ path: testInfo.outputPath("video-comment-error-390.png") })
  await harness.getByText("Cancelar comentário").click()
  await harness.getByLabel("Opções do vídeo").click()
  await page.getByText("Salvar vídeo").click()
  await expect(page.locator("body")).toHaveAttribute("data-video-saved", "true")
})
