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
  await expect(host.locator('[data-slot="artifact-annotation-dock"]')).toHaveCount(0)
  await host.locator('[data-slot="artifact-annotation-stage"]').click({ button: "right" })
  await expect(host.locator('[data-slot="artifact-annotation-dock"]')).toBeVisible()
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

story("keeps the native preview aligned on scroll and hides it when clipped", async ({ page, mount }) => {
  await mount("components-markdown--complete-response")
  await page.evaluate(async (url) => {
    const { mountScrollingEmbed } = await import(url)
    mountScrollingEmbed()
  }, fixture)
  const host = page.getByTestId("scrolling-native-fixture")
  const scroll = host.locator("[data-scrollable]")
  const view = host.locator(".scrolling-native-fixture")
  const layout = async () => JSON.parse((await host.getAttribute("data-layout")) ?? "null")
  await expect.poll(async () => (await layout())?.visible).toBe(true)
  await scroll.evaluate((element) => { element.scrollTop = 40 })
  await expect.poll(async () => (await layout())?.bounds.y).toBe(Math.round((await view.boundingBox())!.y))
  await expect.poll(async () => (await layout())?.visible).toBe(true)
  await scroll.evaluate((element) => { element.scrollTop = 100 })
  await expect.poll(async () => (await layout())?.visible).toBe(false)
  await scroll.evaluate((element) => { element.scrollTop = 40 })
  await expect.poll(async () => (await layout())?.visible).toBe(true)
  await expect.poll(async () => (await layout())?.bounds.y).toBe(Math.round((await view.boundingBox())!.y))
})
