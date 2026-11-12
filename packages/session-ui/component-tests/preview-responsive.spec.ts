import { expect, sourceURL, story } from "../../stories/playwright/story"

const fixture = sourceURL(new URL("./markdown.fixture.tsx", import.meta.url))

story("image thumbnails crop wide images to one quarter of the chat width", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: "`wide.png` `portrait.png`", fixtureImages: true })
  }, fixture)
  const harness = page.getByTestId("markdown-fixture")
  const gallery = harness.locator("[data-markdown-image-gallery]")
  const wide = gallery.getByRole("button", { name: "wide.png" })
  const portrait = gallery.getByRole("button", { name: "portrait.png" })
  await expect(wide).toBeVisible()
  await expect(portrait).toBeVisible()
  for (const width of [500, 280]) {
    await harness.evaluate((node, value) => {
      node.style.width = `${value}px`
    }, width)
    const bounds = await gallery.boundingBox()
    const wideBounds = await wide.boundingBox()
    const portraitBounds = await portrait.boundingBox()
    expect(bounds).not.toBeNull()
    expect(wideBounds).not.toBeNull()
    expect(portraitBounds).not.toBeNull()
    expect(wideBounds!.width).toBeLessThanOrEqual(bounds!.width * 0.25 + 1)
    expect(wideBounds!.height).toBe(120)
    expect(portraitBounds!.width).toBeLessThanOrEqual(bounds!.width * 0.25 + 1)
    await expect(wide).toHaveCSS("object-fit", "cover")
  }
  await wide.click()
  await expect(page.getByRole("dialog")).toBeVisible()
})

story("thumbnail actions escape the scrolling gallery and remain clickable", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: "`wide.png` `portrait.png`", fixtureImages: true })
  }, fixture)
  const harness = page.getByTestId("markdown-fixture")
  await harness.evaluate((element) => { element.style.width = "280px" })
  const gallery = harness.locator("[data-markdown-image-gallery]")
  const item = gallery.locator("[data-markdown-image-item]").first()
  await expect(item.locator("img")).toBeVisible()
  await item.getByLabel("Opções de prévia").click()
  const action = item.getByRole("button", { name: "Abrir no painel direito" })
  await expect(action).toBeVisible()
  const itemBox = (await item.boundingBox())!
  const actionBox = (await action.boundingBox())!
  expect(actionBox.width).toBeGreaterThan(itemBox.width)
  expect(await action.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
  })).toBe(true)
  await action.click()
  await expect(page.locator("body")).toHaveAttribute("data-preview-open", "wide.png:true:panel")
})

story("HTML blocks retain their code and fit narrow and wide chat views", async ({ page, mount }, testInfo) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: "```html\n<h1 id=\"target\">Exemplo</h1>\n```", previews: true })
  }, fixture)
  const harness = page.getByTestId("markdown-fixture")
  await expect(harness.locator("pre code")).toContainText("Exemplo")
  await harness.locator("[data-markdown-media]").scrollIntoViewIfNeeded()
  await expect(harness.locator("iframe")).toHaveAttribute("sandbox", "")
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
