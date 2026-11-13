import { expect, sourceURL, story } from "../../stories/playwright/story"

const fixture = sourceURL(new URL("./markdown.fixture.tsx", import.meta.url))

story("local HTML opens in the panel from a static card", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (fixture) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: "`out/index.html`", previews: true })
  }, fixture)
  const card = page.getByTestId("markdown-fixture").locator('[data-markdown-media="html"]')
  await expect(card.locator("iframe")).toHaveCount(0)
  await card.getByRole("button").click()
  await expect(page.locator("body")).toHaveAttribute("data-preview-open", "out/index.html:true:panel")
})

story("HTML source is never executed in the conversation", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  const requests: string[] = []
  await page.route("https://preview-leak.invalid/**", (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  const html = '<img src="https://preview-leak.invalid/image"><script>fetch("https://preview-leak.invalid/fetch")</script>'
  await page.evaluate(async ({ fixture, html }) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: `\`\`\`html\n${html}\n\`\`\``, previews: true })
  }, { fixture, html })
  const harness = page.getByTestId("markdown-fixture")
  await expect(harness.locator("iframe")).toHaveCount(0)
  await expect(harness.locator("pre code.language-html")).toHaveText(html)
  await harness.locator('[data-html-artifact-card]').click()
  await expect(page.locator("body")).toHaveAttribute("data-preview-inline", html)
  expect(requests).toEqual([])
})

story("published HTML artifacts open from a static card", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  const path = "/api/experimental/artifacts/art_1d19dc7fd001M70eVATBxuLPkT/view/"
  await page.evaluate(async ({ fixture, path }) => {
    const { mountMarkdown } = await import(fixture)
    await mountMarkdown({ text: `\`${path}\``, previews: true })
  }, { fixture, path })
  const preview = page.getByTestId("markdown-fixture").locator('[data-markdown-media="artifact"]')
  await expect(preview.locator("iframe")).toHaveCount(0)
  await preview.getByRole("button").click()
  await expect(page.locator("body")).toHaveAttribute("data-preview-open", `${path}:true:panel`)
})
