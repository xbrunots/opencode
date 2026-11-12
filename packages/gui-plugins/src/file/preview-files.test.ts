import { expect, test } from "bun:test"
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { previewAssets, previewFile } from "./preview-files"

test("serves referenced project assets without exposing hidden or outside files", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "opencode-preview-test-"))
  const root = path.join(temporary, "project")

  try {
    await mkdir(path.join(root, "assets"), { recursive: true })
    await Promise.all([
      writeFile(path.join(root, "index.html"), '<link href="assets/site.css"><script src="assets/main.js"></script>'),
      writeFile(path.join(root, "assets", "site.css"), 'body { background: url("picture.svg") }'),
      writeFile(path.join(root, "assets", "main.js"), 'import "./module.js"; fetch("./data.json")'),
      writeFile(path.join(root, "assets", "module.js"), "export default 1"),
      writeFile(path.join(root, "assets", "data.json"), '{"title":"Preview"}'),
      writeFile(path.join(root, "assets", "picture.svg"), "<svg></svg>"),
      writeFile(path.join(root, ".env"), "secret"),
      writeFile(path.join(temporary, "outside.js"), "secret"),
    ])
    const resolved = await realpath(root)
    const target = await previewFile(resolved, "index.html")

    if (!target) throw new Error("HTML de teste não encontrado")
    const assets = await previewAssets(resolved, target)

    expect(assets.has(await realpath(path.join(root, "assets", "site.css")))).toBe(true)
    expect(assets.has(await realpath(path.join(root, "assets", "main.js")))).toBe(true)
    expect(assets.has(await realpath(path.join(root, "assets", "module.js")))).toBe(true)
    expect(assets.has(await realpath(path.join(root, "assets", "data.json")))).toBe(true)
    expect(assets.has(await realpath(path.join(root, "assets", "picture.svg")))).toBe(true)
    expect(await previewFile(resolved, ".env")).toBeUndefined()
    expect(await previewFile(resolved, "../outside.js")).toBeUndefined()
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
