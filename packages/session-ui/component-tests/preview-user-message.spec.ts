import { expect, story } from "../../stories/playwright/story"

story("referenced visual media and attachments appear inside the user message bubble", async ({ mount }) => {
  const root = await mount("current-prompt-message--preview-references")
  const bubble = root.locator('[data-slot="user-message-text"]')
  await expect(bubble).toContainText("Remova o fundo")
  await expect(bubble.locator('[data-slot="user-message-attachments"] img')).toBeVisible()
  await expect(bubble.locator('img[data-local-image="foto-bruno.jpg"]')).toBeVisible()
  await expect(bubble.locator('[data-markdown-media="html"] [data-html-artifact-card]')).toBeVisible()
  await expect(bubble.locator('[data-markdown-media="html"] iframe')).toHaveCount(0)
  await expect(bubble.locator('img[data-local-image="missing.png"]')).toBeHidden()
})
