import type { WebContentsView } from "electron"
import { Schema } from "effect"
import { previewSourceLine } from "./preview-source"

const description = Schema.Struct({
  selector: Schema.String,
  tag: Schema.String,
  id: Schema.String,
  component: Schema.optionalKey(Schema.String),
  html: Schema.String,
  text: Schema.String,
  rect: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, width: Schema.Finite, height: Schema.Finite }),
})

/** Inspect the actual Chromium DOM, independently of page-supplied event handlers. */
export async function inspectPreview(input: {
  view: WebContentsView
  source: (url: URL) => Promise<{ path: string; content: string } | undefined>
  x: number
  y: number
  width: number
  height: number
  screenshot?: boolean
}) {
  if (input.width <= 0 || input.height <= 0 || input.x < 0 || input.y < 0 || input.x >= input.width || input.y >= input.height) return null
  const contents = input.view.webContents

  if (contents.isDestroyed()) return null
  const bounds = input.view.getBounds()
  const scaleX = bounds.width / input.width
  const scaleY = bounds.height / input.height

  if (!scaleX || !scaleY) return null

  const debugger_ = contents.debugger

  if (!debugger_.isAttached()) debugger_.attach("1.3")
  await debugger_.sendCommand("DOM.enable")
  const found = await debugger_.sendCommand("DOM.getNodeForLocation", { x: Math.floor(input.x * scaleX), y: Math.floor(input.y * scaleY), ignorePointerEventsNone: true })

  if (!found.backendNodeId) return null
  const resolved = await debugger_.sendCommand("DOM.resolveNode", { backendNodeId: found.backendNodeId })

  if (!resolved.object?.objectId) return null

  const result = await debugger_.sendCommand("Runtime.callFunctionOn", {
    objectId: resolved.object.objectId,
    returnByValue: true,
    functionDeclaration: `function() {
      if (!(this instanceof Element)) return null
      const path = []
      for (let node = this; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
        if (node.id && document.querySelectorAll('#' + CSS.escape(node.id)).length === 1) {
          path.unshift('#' + CSS.escape(node.id))
          break
        }
        const same = Array.from(node.parentElement?.children ?? []).filter(child => child.localName === node.localName)
        path.unshift(CSS.escape(node.localName) + (same.length > 1 ? ':nth-of-type(' + (same.indexOf(node) + 1) + ')' : ''))
      }
      const box = this.getBoundingClientRect()
      const component = (this.getAttribute('data-component') || this.getAttribute('data-slot') || '').slice(0, 256) || undefined
      const selector = path.join(' > ')
      return { selector: selector.length <= 2048 ? selector : '', tag: this.localName, id: this.id, component, html: this.outerHTML.slice(0, 16384), text: (this.innerText ?? this.textContent ?? '').trim().slice(0, 512), rect: { x: box.x, y: box.y, width: box.width, height: box.height } }
    }`,
  })

  await debugger_.sendCommand("Runtime.releaseObject", { objectId: resolved.object.objectId })

  if (!result.result?.value) return null
  const element = Schema.decodeUnknownSync(description)(result.result.value)
  const rect = { x: element.rect.x / scaleX, y: element.rect.y / scaleY, width: element.rect.width / scaleX, height: element.rect.height / scaleY }

  if (!input.screenshot) return { ...element, rect }

  const current = new URL(contents.getURL())
  const source = current.protocol === "oc-preview:" && current.hostname === "workspace" ? await input.source(current).catch(() => undefined) : undefined
  const match = source ? previewSourceLine(source.content, element.html, element.tag, element.id) : undefined

  if (!source || !match) return { ...element, rect }

  return { ...element, rect, source: { path: source.path, ...match } }
}
