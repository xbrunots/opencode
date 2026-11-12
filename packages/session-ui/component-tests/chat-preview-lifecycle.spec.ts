import { expect, sourceURL, story } from "../../stories/playwright/story"

const fixture = sourceURL(new URL("./chat-preview.fixture.tsx", import.meta.url))

story("releases offscreen chat previews but keeps an annotation in progress", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (url) => {
    const { mountChatPreview } = await import(url)
    mountChatPreview()
  }, fixture)
  const host = page.getByTestId("native-chat-fixture")
  await host.scrollIntoViewIfNeeded()
  const scroll = host.locator("[data-scrollable]")
  await expect(host).toHaveAttribute("data-opened", "1")
  await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(host).toHaveAttribute("data-closed", "1")
  await scroll.evaluate((element) => { element.scrollTop = 0 })
  await expect(host).toHaveAttribute("data-opened", "2")
  await host.locator('[data-slot="artifact-annotation-native-open"]').click()
  await expect(host.locator('[data-slot="artifact-annotation-close"]')).toBeVisible()
  await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(host).toHaveAttribute("data-closed", "1")
  await scroll.evaluate((element) => { element.scrollTop = 0 })
  await host.locator('[data-slot="artifact-annotation-close"]').click()
  await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight })
  await expect(host).toHaveAttribute("data-closed", "2")
})

story("fits an interactive preview inside a short scroll viewport", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (url) => {
    const { mountChatPreview } = await import(url)
    mountChatPreview(120)
  }, fixture)
  const host = page.getByTestId("native-chat-fixture")
  await host.scrollIntoViewIfNeeded()
  await expect(host).toHaveAttribute("data-opened", "1")
  const viewer = host.locator("[data-preview-viewer]")
  const scroll = host.locator("[data-scrollable]")
  const viewBox = (await viewer.boundingBox())!
  const scrollBox = (await scroll.boundingBox())!
  expect(viewBox.height).toBeLessThanOrEqual(scrollBox.height)
})
