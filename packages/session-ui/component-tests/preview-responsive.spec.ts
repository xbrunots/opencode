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

story("preview actions appear at their final position without a flash and respect reduced motion", async ({ page, mount }) => {
  await page.setViewportSize({ width: 500, height: 400 })
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: "`wide.png`", fixtureImages: true })
  }, fixture)
  const item = page.getByTestId("markdown-fixture").locator("[data-markdown-image-item]")
  await expect(item.locator("img")).toBeVisible()
  const frames = await item.evaluate(async (element) => {
    const trigger = element.querySelector<HTMLElement>("summary")!
    const menu = element.querySelector<HTMLElement>("[popover]")!
    const anchor = trigger.getBoundingClientRect()
    trigger.style.transform = `translateX(${window.innerWidth - anchor.right - 12}px)`
    trigger.click()
    const frames: { x: number; y: number; width: number; height: number }[] = []
    for (let frame = 0; frame < 16; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const style = getComputedStyle(menu)
      if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) continue
      const box = menu.getBoundingClientRect()
      frames.push({ x: box.x, y: box.y, width: box.width, height: box.height })
    }
    return frames
  })
  expect(frames.length).toBeGreaterThan(1)
  const last = frames[frames.length - 1]!
  for (const frame of frames) {
    expect(Math.abs(frame.x - last.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(frame.y - last.y)).toBeLessThanOrEqual(5)
    expect(frame.x).toBeGreaterThanOrEqual(7)
    expect(frame.x + frame.width).toBeLessThanOrEqual(493)
  }
  await item.locator("details").evaluate((element: HTMLDetailsElement) => { element.open = false })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await item.getByLabel("Opções de prévia").evaluate((element: HTMLElement) => element.click())
  const menu = item.locator("[popover]")
  await expect(menu).toBeVisible()
  await expect(menu).toHaveCSS("animation-name", "none")
})

story("preview actions stay inside a small viewport when their anchor moves offscreen", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: "`wide.png`", fixtureImages: true })
  }, fixture)
  const item = page.getByTestId("markdown-fixture").locator("[data-markdown-image-item]")
  const trigger = item.getByLabel("Opções de prévia")
  await trigger.click()
  const menu = item.locator("[popover]")
  await expect(menu).toBeVisible()
  await page.setViewportSize({ width: 180, height: 120 })
  for (const offset of [-900, 900]) {
    await trigger.evaluate((element, value) => { element.style.transform = `translate(${value}px, ${value}px)` }, offset)
    await page.evaluate(() => window.dispatchEvent(new Event("scroll")))
    await expect.poll(async () => {
      const box = await menu.boundingBox()
      return box && box.x >= 7 && box.y >= 7 && box.x + box.width <= 173 && box.y + box.height <= 113
    }).toBe(true)
  }
})

story("HTML blocks retain their code and fit narrow and wide chat views", async ({ page, mount }, testInfo) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: "```html\n<h1 id=\"target\">Exemplo</h1>\n```", previews: true })
  }, fixture)
  const harness = page.getByTestId("markdown-fixture")
  await expect(harness.locator("pre code")).toContainText("Exemplo")
  const card = harness.locator("[data-html-artifact-card]")
  await expect(card).toBeVisible()
  await expect(harness.locator("iframe")).toHaveCount(0)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 })
    const bounds = await card.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
    await harness.scrollIntoViewIfNeeded()
    await harness.screenshot({ path: testInfo.outputPath(`html-${width}.png`) })
  }
  await card.click()
  await expect(page.locator("body")).toHaveAttribute("data-preview-inline", '<h1 id="target">Exemplo</h1>')
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
