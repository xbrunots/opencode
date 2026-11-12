import { expect, sourceURL, story } from "../../stories/playwright/story"

const fixture = sourceURL(new URL("./markdown.fixture.tsx", import.meta.url))

story(
  "local HTML preview is isolated and sends the clicked coordinates to the conversation",
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
    const frame = harness.locator("iframe")
    await expect(frame).toHaveAttribute("sandbox", "")
    await expect(frame.contentFrame().locator("body")).toContainText("Hello")
    await harness.getByText("Comentar ponto").click()
    const layer = harness.locator("[data-preview-annotation-layer]")
    const box = (await layer.boundingBox())!
    await layer.click({ position: { x: box.width / 4, y: box.height * 3 / 4 } })
    await harness.getByLabel("Comentário sobre a prévia").fill("Ajuste este elemento")
    await harness.getByText("Adicionar à mensagem").click()
    const result = await page.locator("body").getAttribute("data-preview-annotation")
    expect(JSON.parse(result!)).toMatchObject({
      serverID: "fixture-server",
      sessionID: "fixture-session",
      src: "out/index.html",
      comment: "Ajuste este elemento",
    })
    expect(JSON.parse(result!).x).toBeCloseTo(25, 0)
    expect(JSON.parse(result!).y).toBeCloseTo(75, 0)
    await expect(page.locator("body")).not.toHaveAttribute("data-preview-script", "ran")
    await harness.getByLabel("Opções de prévia").click()
    await harness.getByText("Abrir no painel direito").click()
    await expect(page.locator("body")).toHaveAttribute("data-preview-open", "out/index.html:true:panel")
  },
)

story("HTML previews do not execute scripts, navigate, or load remote resources", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  const requests: string[] = []
  await page.route("https://preview-leak.invalid/**", (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({
      text: "```html\n<meta http-equiv=\"refresh\" content=\"0;url=https://preview-leak.invalid/redirect\"><div id=\"animated\">before</div><img src=\"https://preview-leak.invalid/image\"><script>fetch('https://preview-leak.invalid/fetch');location.href='https://preview-leak.invalid/navigation'</script>\n```",
      previews: true,
    })
  }, fixture)
  const harness = page.getByTestId("markdown-fixture")
  await harness.locator("[data-markdown-media]").scrollIntoViewIfNeeded()
  const frame = harness.locator("iframe")
  await expect(frame).toHaveAttribute("sandbox", "")
  await expect(frame.contentFrame().locator("#animated")).toHaveText("before")
  await expect(frame.contentFrame().locator("meta[http-equiv=refresh]")).toHaveCount(0)
  expect(requests).toEqual([])
})

story("preserves an annotation when no conversation accepts it", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: "`out/demo.html`", previews: true })
  }, fixture)
  const harness = page.getByTestId("markdown-fixture")
  await expect(harness.locator("iframe").contentFrame().locator("body")).toContainText("Hello")
  await harness.getByText("Comentar ponto").click()
  await harness.locator("[data-preview-annotation-layer]").click({ position: { x: 50, y: 50 } })
  const comment = harness.getByLabel("Comentário sobre a prévia")
  await comment.fill("Não perder este comentário")
  await harness.getByText("Adicionar à mensagem").click()
  await expect(comment).toHaveValue("Não perder este comentário")
  await expect(harness.getByRole("alert")).toContainText("Não foi possível")
  await expect(harness.locator("[data-preview-annotation-layer]")).toBeVisible()
})

story("shows a published artifact referenced by its view path", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: "`/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/`", previews: true })
  }, fixture)
  const preview = page.getByTestId("markdown-fixture").locator('[data-markdown-media="artifact"]')
  await preview.scrollIntoViewIfNeeded()
  await expect(preview.locator("iframe").contentFrame().locator("body")).toContainText("Hello")
  await expect(preview.locator("iframe")).toHaveAttribute("sandbox", "")
})

story("falls back to a sandboxed artifact when a native preview cannot open", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: "`/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/`", previews: true, nativePreviewFailure: true })
  }, fixture)
  const preview = page.getByTestId("markdown-fixture").locator('[data-markdown-media="artifact"]')
  await preview.scrollIntoViewIfNeeded()
  await expect(preview.locator("iframe").contentFrame().locator("body")).toContainText("Hello")
  await expect(page.locator("body")).toHaveAttribute("data-native-preview-disposed", "true")
})

story("keeps the HTML source visible beside its automatic sandboxed preview", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: "```html\n<h1>Example</h1>\n```", previews: true })
  }, fixture)
  const harness = page.getByTestId("markdown-fixture")
  await harness.locator("[data-markdown-media]").scrollIntoViewIfNeeded()
  const frame = harness.locator("iframe")
  await expect(frame).toHaveAttribute("sandbox", "")
  await expect(frame.contentFrame().locator("h1")).toHaveText("Example")
  await expect(harness.locator("pre code.language-html")).toHaveText("<h1>Example</h1>")
})
