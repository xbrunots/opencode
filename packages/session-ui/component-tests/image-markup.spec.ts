import { expect, story } from "../../stories/playwright/story"

story("marks an image without losing strokes when delivery fails or Escape is pressed", async ({ page, mount }, testInfo) => {
  await mount("components-image-preview--annotatable", { globals: { theme: "dark" } })
  await page.evaluate(() => {
    let attempts = 0
    window.addEventListener("opencode:image-markup", (event) => {
      const detail = (event as CustomEvent).detail
      event.preventDefault()
      if (++attempts === 1) {
        detail.completion = Promise.resolve(false)
        return
      }
      detail.completion = (async () => {
        const bitmap = await createImageBitmap(detail.file)
        const canvas = document.createElement("canvas")
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext("2d")!
        context.drawImage(bitmap, 0, 0)
        const pixel = context.getImageData(bitmap.width / 2, bitmap.height / 2, 1, 1).data
        document.body.dataset.markup = JSON.stringify({ name: detail.file.name, width: bitmap.width, height: bitmap.height, pixel: Array.from(pixel) })
        return true
      })()
    })
  })
  const preview = page.locator('[data-component="image-preview"]')
  await expect(preview).toHaveAttribute("data-stage", "rest")
  await preview.getByRole("button", { name: "Markup", exact: true }).click()
  const drawing = preview.getByRole("img", { name: "Draw on the image" })
  await expect(drawing).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("image-dock-dark-desktop.png") })
  await page.setViewportSize({ width: 390, height: 844 })
  const cancel = preview.getByRole("button", { name: "Cancel", exact: true })
  const right = (await cancel.boundingBox())!
  expect(right.x + right.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: testInfo.outputPath("image-dock-dark-mobile.png") })
  await page.setViewportSize({ width: 1280, height: 720 })
  const box = (await drawing.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 8 })
  await page.mouse.up()
  await preview.getByRole("button", { name: "Add to message" }).click()
  await expect(preview.getByRole("alert")).toContainText("Your drawing is still available")
  await page.keyboard.press("Escape")
  await expect(preview).toHaveAttribute("data-stage", "rest")
  await expect(drawing.locator("polyline")).toHaveCount(1)
  await preview.getByRole("button", { name: "Add to message" }).click()
  await expect(page.locator("body")).toHaveAttribute("data-markup", /"name":"markup.png"/)
  const result = JSON.parse((await page.locator("body").getAttribute("data-markup"))!)
  expect(result.width).toBe(1600)
  expect(result.height).toBe(1000)
  expect(result.pixel[0]).toBeGreaterThan(230)
  expect(result.pixel[1]).toBeLessThan(130)
})

story("keeps the editor open for several image comments and protects an unfinished comment", async ({ page, mount }) => {
  await mount("components-image-preview--annotatable", { globals: { theme: "dark" } })
  await page.evaluate(() => {
    const notes: unknown[] = []
    window.addEventListener("opencode:image-annotation", (event) => {
      const detail = (event as CustomEvent).detail
      notes.push({ x: detail.x, y: detail.y, comment: detail.comment })
      document.body.dataset.notes = JSON.stringify(notes)
      event.preventDefault()
    })
  })
  const preview = page.locator('[data-component="image-preview"]')
  await expect(preview).toHaveAttribute("data-stage", "rest")
  const image = preview.getByRole("button", { name: "Add a comment to the image" })
  await image.click({ position: { x: 100, y: 80 } })
  const comment = preview.getByLabel("Comment on this point")
  await comment.fill("Move the heading")
  await expect(preview.getByRole("button", { name: "Markup", exact: true })).toBeDisabled()
  await page.keyboard.press("Escape")
  await expect(comment).toHaveValue("Move the heading")
  await preview.getByRole("button", { name: "Add to message" }).click()
  await expect(preview).toHaveAttribute("data-stage", "rest")
  await expect(preview.locator('[data-slot="image-preview-sent-marker"]')).toHaveText(["1"])
  await image.click({ position: { x: 200, y: 160 } })
  await comment.fill("Change the color")
  await preview.getByRole("button", { name: "Add to message" }).click()
  await expect(preview.locator('[data-slot="image-preview-sent-marker"]')).toHaveText(["1", "2"])
  const notes = JSON.parse((await page.locator("body").getAttribute("data-notes"))!)
  expect(notes.map((note: { comment: string }) => note.comment)).toEqual(["Move the heading", "Change the color"])
  expect(notes[1].x).toBeGreaterThan(notes[0].x)
  expect(notes[1].y).toBeGreaterThan(notes[0].y)
})
