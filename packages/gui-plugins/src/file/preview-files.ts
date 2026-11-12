import { readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"

const extensions = /\.(?:html?|css|m?js|json|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm|mp3|wav)$/i

const text = /\.(?:html?|css|m?js)$/i

/** Resolve existing project assets without following links outside the workspace. */
export async function previewFile(root: string, requested: string) {
  const file = await realpath(path.resolve(root, requested))
  const relative = path.relative(root, file)

  if (relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative)) return

  if (relative.split(path.sep).some((part) => part.startsWith("."))) return

  if (!extensions.test(file) || !(await stat(file)).isFile()) return

  return file
}

/** Only files named by the HTML or its local script/style dependencies are exposed to the preview. */
export async function previewAssets(root: string, target: string) {
  const allowed = new Set<string>([target])
  const pending = [target]

  while (pending.length && allowed.size < 512) {
    const file = pending.shift()!

    if (!text.test(file) || (await stat(file)).size > 4 * 1024 * 1024) continue
    const source = await readFile(file, "utf8")

    const references = [
      ...source.matchAll(/["'`]([^"'`\r\n]{1,2048})["'`]/g),
      ...source.matchAll(/url\(\s*([^\s)"']+)\s*\)/gi),
    ]

    for (const match of references) {
      const value = match[1].split(/[?#]/, 1)[0]

      if (!extensions.test(value) || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) continue
      const name = value.startsWith("/") ? path.join(root, value.slice(1)) : path.resolve(path.dirname(file), value)
      const resource = await previewFile(root, name).catch(() => undefined)

      if (!resource || allowed.has(resource)) continue
      allowed.add(resource)
      pending.push(resource)

      if (allowed.size >= 512) break
    }
  }

  return allowed
}
