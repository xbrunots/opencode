import { createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { Icon } from "@opencode/ui/icon"
import { uuid } from "@opencode/util/uuid"
import { HtmlPreview } from "./preview-ipc"

type Position = { x: number; y: number; left: number; top: number }
type ElementReference = {
  selector: string
  tag: string
  component?: string
  html?: string
  text?: string
  rect: { x: number; y: number; width: number; height: number }
  source?: { path: string; line: number; confidence: "exact" | "inferred" }
  screenshot?: string
}
type Note = Position & { id: string; comment: string; element?: ElementReference; time?: number; viewport: { width: number; height: number } }
type Stroke = Position[]

/** The live native view freezes only while the user is annotating it. */
export function ArtifactAnnotation(props: {
  sessionID: string
  serverID: string
  path: string
  kind: string
  native?: boolean
  previewID?: string
  onActiveChange?: (active: boolean) => void
  children: JSX.Element
}) {
  const ctx = usePlugin()
  const ipc = ctx.main(HtmlPreview)
  const [mode, setMode] = createSignal<"draw" | "comment">()
  const [notes, setNotes] = createSignal<Note[]>([])
  const [selected, setSelected] = createSignal<Note>()
  const [hover, setHover] = createSignal<ElementReference>()
  const [strokes, setStrokes] = createSignal<Stroke[]>([])
  const [failed, setFailed] = createSignal(false)
  const [outside, setOutside] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [geometry, setGeometry] = createSignal(0)
  let stage: HTMLDivElement | undefined
  let nativeImage: string | undefined
  let frozenID: string | undefined
  let pointer: number | undefined
  let inspectRequest = 0
  let hoverFrame = 0
  let hoverBusy = false
  let pendingHover: { x: number; y: number; request: number } | undefined
  let attempt = 0
  let identity: { serverID: string; sessionID: string; path: string; previewID?: string; imageSrc?: string } | undefined

  const sameTarget = () => {
    const image = media()
    return identity?.serverID === props.serverID && identity.sessionID === props.sessionID && identity.path === props.path && identity.previewID === props.previewID && (!identity.imageSrc || image instanceof HTMLImageElement && identity.imageSrc === image.src)
  }

  const reset = () => {
    attempt++
    inspectRequest++
    pendingHover = undefined
    if (hoverFrame) cancelAnimationFrame(hoverFrame)
    hoverFrame = 0
    setMode(undefined)
    props.onActiveChange?.(false)
    setNotes([])
    setSelected(undefined)
    setHover(undefined)
    setStrokes([])
    setFailed(false)
    setOutside(false)
    setBusy(false)
    identity = undefined
    if (frozenID) void ipc.freeze({ id: frozenID, active: false }).catch(() => undefined)
    frozenID = undefined
    if (nativeImage) URL.revokeObjectURL(nativeImage)
    nativeImage = undefined
  }

  onCleanup(reset)

  const media = () => stage?.querySelector<HTMLVideoElement | HTMLImageElement | HTMLIFrameElement | HTMLDivElement>(
    "video, img[data-slot='artifact-media'], iframe, [data-slot='artifact-native-preview']",
  )
  // The image can be re-fitted after the outer panel resize, so observe both geometries.
  onMount(() => {
    if (!stage) return
    const root = stage
    const resize = new ResizeObserver(() => {
      setGeometry((value) => value + 1)
      setHover(undefined)
    })
    let observed: Element | undefined
    const watch = () => {
      const next = media() ?? undefined
      if (next === observed) return
      if (observed) resize.unobserve(observed)
      observed = next
      if (next) resize.observe(next)
    }
    const mutations = new MutationObserver(watch)
    resize.observe(root)
    mutations.observe(root, { childList: true, subtree: true })
    watch()
    onCleanup(() => { mutations.disconnect(); resize.disconnect() })
  })
  const targetRect = () => media()?.getBoundingClientRect() ?? stage?.getBoundingClientRect()
  const project = (point: Position) => {
    geometry()
    const box = stage?.getBoundingClientRect()
    const rect = targetRect()
    if (!box?.width || !box.height || !rect) return point
    return {
      left: ((rect.left - box.left + point.x * rect.width / 100) / box.width) * 100,
      top: ((rect.top - box.top + point.y * rect.height / 100) / box.height) * 100,
    }
  }
  const position = (clientX: number, clientY: number) => {
    const box = stage?.getBoundingClientRect()
    const rect = targetRect()
    if (!box || !rect || !rect.width || !rect.height || !box.width || !box.height) return
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
      left: ((clientX - box.left) / box.width) * 100,
      top: ((clientY - box.top) / box.height) * 100,
    }
  }
  const inspect = async (clientX: number, clientY: number, screenshot = false) => {
    const rect = targetRect()
    const id = props.previewID
    if (!id || !rect) return
    return ipc.inspect({ id, x: clientX - rect.left, y: clientY - rect.top, width: rect.width, height: rect.height, screenshot })
  }
  const enter = async (next: "draw" | "comment") => {
    if (mode() || busy()) return
    setFailed(false)
    const image = media()
    identity = { serverID: props.serverID, sessionID: props.sessionID, path: props.path, previewID: props.previewID, imageSrc: image instanceof HTMLImageElement ? image.src : undefined }
    if (props.native) {
      const id = props.previewID
      if (!id) return setFailed(true)
      const current = ++attempt
      setBusy(true)
      const frozen = await ipc.freeze({ id, active: true }).then(() => true).catch(() => false)
      if (current !== attempt || !sameTarget()) {
        if (frozen) void ipc.freeze({ id, active: false }).catch(() => undefined)
        if (current === attempt) { setBusy(false); setFailed(true) }
        return
      }
      if (frozen) frozenID = id
      const bytes = frozen ? await ctx.embeds.capture(id).catch(() => undefined) : undefined
      if (current !== attempt) return
      if (!sameTarget()) {
        if (frozenID) void ipc.freeze({ id: frozenID, active: false }).catch(() => undefined)
        frozenID = undefined
        setBusy(false)
        return setFailed(true)
      }
      setBusy(false)
      if (!bytes?.length) {
        if (frozenID) void ipc.freeze({ id: frozenID, active: false }).catch(() => undefined)
        frozenID = undefined
        return setFailed(true)
      }
      nativeImage = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: "image/jpeg" }))
    }
    setMode(next)
    props.onActiveChange?.(true)
  }
  const inspectHover = async () => {
    if (hoverBusy) return
    hoverBusy = true
    while (pendingHover && mode() === "comment") {
      const next = pendingHover
      pendingHover = undefined
      const result = await inspect(next.x, next.y).catch(() => undefined)
      if (next.request === inspectRequest && mode() === "comment") setHover(result ?? undefined)
    }
    hoverBusy = false
  }
  const move = (event: PointerEvent) => {
    if (mode() === "draw" && pointer === event.pointerId) {
      const next = position(event.clientX, event.clientY)
      if (!next) return
      setStrokes((current) => current.map((stroke, index) => index === current.length - 1 ? [...stroke, next] : stroke))
      return
    }
    if (mode() !== "comment" || !props.previewID || !sameTarget() || busy()) return
    pendingHover = { x: event.clientX, y: event.clientY, request: ++inspectRequest }
    if (hoverFrame) cancelAnimationFrame(hoverFrame)
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0
      void inspectHover()
    })
  }
  const select = async (clientX: number, clientY: number) => {
    if (!sameTarget()) return setFailed(true)
    const next = position(clientX, clientY)
    if (!next) return setOutside(true)
    setOutside(false)
    const current = selected()
    if (current?.comment.trim()) setNotes((existing) => [...existing, current])
    const shown = media()
    const audio = stage?.querySelector<HTMLAudioElement>("audio")
    const rect = targetRect()
    if (!rect) return
    setSelected({ ...next, id: uuid(), comment: "", viewport: { width: rect.width, height: rect.height }, time: shown instanceof HTMLVideoElement ? shown.currentTime : audio?.currentTime })
    setFailed(false)
    if (props.previewID) {
      const request = ++inspectRequest
      setBusy(true)
      const result = await inspect(clientX, clientY, true).catch(() => undefined)
      setBusy(false)
      if (request === inspectRequest) setSelected((value) => value ? { ...value, element: result ?? undefined } : value)
    }
    requestAnimationFrame(() => stage?.querySelector<HTMLInputElement>("[data-slot='artifact-annotation-input']")?.focus())
  }
  const captureElement = async (note: Note) => {
    if (!nativeImage) return
    const element = note.element
    const rect = note.viewport
    if (!element || !rect.width || !rect.height) return
    const source = await loadImage(nativeImage)
    const x = Math.max(0, element.rect.x)
    const y = Math.max(0, element.rect.y)
    const right = Math.min(rect.width, element.rect.x + element.rect.width)
    const bottom = Math.min(rect.height, element.rect.y + element.rect.height)
    if (right <= x || bottom <= y) return
    const scaleX = source.naturalWidth / rect.width
    const scaleY = source.naturalHeight / rect.height
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round((right - x) * scaleX))
    canvas.height = Math.max(1, Math.round((bottom - y) * scaleY))
    const context = canvas.getContext("2d")
    if (!context) return
    context.drawImage(source, x * scaleX, y * scaleY, (right - x) * scaleX, (bottom - y) * scaleY, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    return blob ? new File([blob], `element-${note.id.slice(0, 8)}.png`, { type: "image/png" }) : undefined
  }
  const submitComments = async () => {
    if (!sameTarget()) return setFailed(true)
    const currentAttempt = attempt
    const current = selected()
    const pending = [...notes(), ...(current?.comment.trim() ? [current] : [])]
    if (!pending.length) return
    setBusy(true)
    for (const [index, note] of pending.entries()) {
      const file = note.element ? await captureElement(note).catch(() => undefined) : undefined
      if (currentAttempt !== attempt) return
      if (!sameTarget()) { setBusy(false); return setFailed(true) }
      if (props.previewID && (!note.element || !file)) {
        setBusy(false)
        return setFailed(true)
      }
      const detail: { sessionID: string; serverID: string; src: string; x: number; y: number; time?: number; comment: string; element?: ElementReference; file?: File; completion?: Promise<boolean> } = {
        sessionID: props.sessionID, serverID: props.serverID, src: props.path, x: note.x, y: note.y, time: note.time, comment: note.comment.trim(), element: note.element, file,
      }
      const annotation = new CustomEvent("opencode:image-annotation", {
        cancelable: true,
        detail,
      })
      window.dispatchEvent(annotation)
      const accepted = annotation.defaultPrevented && (!detail.completion || await detail.completion.catch(() => false))
      if (currentAttempt !== attempt) return
      if (!accepted) {
        const remaining = pending.slice(index)
        setNotes(remaining.slice(0, -1))
        setSelected(remaining.at(-1))
        setBusy(false)
        return setFailed(true)
      }
    }
    setBusy(false)
    reset()
  }
  const submitDrawing = async () => {
    if (!sameTarget()) return setFailed(true)
    const currentAttempt = attempt
    const target = media()
    if (!strokes().length || !target) return
    setBusy(true)
    try {
      const source = target instanceof HTMLImageElement ? target : nativeImage ? await loadImage(nativeImage) : undefined
      if (currentAttempt !== attempt) return
      if (!sameTarget()) throw new Error("Preview changed")
      if (!source || !source.naturalWidth || !source.naturalHeight) throw new Error("Image unavailable")
      const canvas = document.createElement("canvas")
      canvas.width = source.naturalWidth
      canvas.height = source.naturalHeight
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Canvas unavailable")
      context.drawImage(source, 0, 0)
      context.strokeStyle = "#4389eb"
      context.lineWidth = Math.max(3, canvas.width / 300)
      context.lineCap = "round"
      context.lineJoin = "round"
      for (const stroke of strokes()) {
        context.beginPath()
        stroke.forEach((point, index) => {
          const x = point.x * canvas.width / 100
          const y = point.y * canvas.height / 100
          if (index) context.lineTo(x, y)
          else context.moveTo(x, y)
        })
        if (stroke.length === 1) context.lineTo(stroke[0].x * canvas.width / 100 + 0.01, stroke[0].y * canvas.height / 100)
        context.stroke()
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
      if (currentAttempt !== attempt) return
      if (!sameTarget()) throw new Error("Preview changed")
      if (!blob) throw new Error("Image unavailable")
      const detail: { sessionID: string; serverID: string; src: string; file: File; completion?: Promise<boolean> } = {
        sessionID: props.sessionID, serverID: props.serverID, src: props.path, file: new File([blob], "markup.png", { type: "image/png" }),
      }
      const event = new CustomEvent("opencode:image-markup", {
        cancelable: true,
        detail,
      })
      window.dispatchEvent(event)
      const accepted = event.defaultPrevented && (!detail.completion || await detail.completion)
      if (currentAttempt !== attempt) return
      if (!accepted) throw new Error("Composer unavailable")
      reset()
    } catch {
      if (currentAttempt === attempt) setFailed(true)
    } finally {
      if (currentAttempt === attempt) setBusy(false)
    }
  }

  const drawable = () => props.kind === "image" || props.kind === "svg" || !!props.native
  const overlay = () => mode() !== undefined
  const startStroke = (event: PointerEvent) => {
    if (mode() !== "draw") return
    if (!sameTarget()) return setFailed(true)
    const next = position(event.clientX, event.clientY)
    if (!next) return setOutside(true)
    setOutside(false)
    pointer = event.pointerId
    if (event.currentTarget instanceof Element) event.currentTarget.setPointerCapture(event.pointerId)
    setStrokes((current) => [...current, [next]])
  }

  return (
    <div ref={stage} data-slot="artifact-annotation-stage" data-native={props.native ? "" : undefined} onKeyDown={(event) => {
      if (event.key !== "Escape" || !mode()) return
      event.preventDefault()
      event.stopPropagation()
    }}>
      {props.children}
      <div data-slot="artifact-annotation-dock-zone" data-active={overlay() ? "" : undefined}>
        <div data-slot="artifact-annotation-dock" role="toolbar" aria-label={ctx.t("view.annotate.toolbar")}>
          <span data-slot="artifact-annotation-grip" aria-hidden="true"><svg viewBox="0 0 8 14" width="8" height="14"><circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/><circle cx="2" cy="7" r="1"/><circle cx="6" cy="7" r="1"/><circle cx="2" cy="12" r="1"/><circle cx="6" cy="12" r="1"/></svg></span>
          <Show when={!mode()}>
            <Show when={drawable()}><button type="button" onClick={() => void enter("draw")} disabled={busy()}><Icon name="edit" />{ctx.t("view.annotate.draw")}</button></Show>
            <button type="button" data-slot="artifact-annotation-native-open" onClick={() => void enter("comment")} disabled={busy()}><Icon name="outline-browser-annotate" />{ctx.t("view.annotate.comment")}</button>
          </Show>
          <Show when={mode()}>
            <span data-slot="artifact-annotation-instruction">{ctx.t(outside() ? "view.annotate.outside" : mode() === "draw" ? "view.annotate.drawHint" : "view.annotate.hint")}</span>
            <button type="button" data-slot="artifact-annotation-send" disabled={busy() || (mode() === "draw" ? !strokes().length : !notes().length && !selected()?.comment.trim())} onClick={() => void (mode() === "draw" ? submitDrawing() : submitComments())}>{ctx.t("view.annotate.send")}</button>
            <button type="button" data-slot="artifact-annotation-close" aria-label={ctx.t("view.annotate.discard")} title={ctx.t("view.annotate.discard")} disabled={busy()} onClick={reset}><Icon name="close" /></button>
          </Show>
        </div>
        <Show when={failed()}><p data-slot="artifact-annotation-error" role="alert">{ctx.t("view.annotate.failed")}</p></Show>
      </div>
      <Show when={overlay()}>
        <button
          type="button"
          data-slot="artifact-annotation-target"
          data-mode={mode()}
          aria-label={ctx.t(mode() === "draw" ? "view.annotate.drawHint" : "view.annotate.hint")}
          onPointerDown={startStroke}
          onPointerMove={move}
          onPointerUp={(event) => { if (pointer === event.pointerId) pointer = undefined }}
          onPointerCancel={() => { pointer = undefined }}
          onClick={(event) => {
            if (mode() !== "comment") return
            const rect = targetRect() ?? event.currentTarget.getBoundingClientRect()
            void select(event.detail === 0 ? rect.left + rect.width / 2 : event.clientX, event.detail === 0 ? rect.top + rect.height / 2 : event.clientY)
          }}
        />
        <svg data-slot="artifact-annotation-ink" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><For each={strokes()}>{(stroke) => <polyline points={stroke.map((point) => { const projected = project(point); return `${projected.left},${projected.top}` }).join(" ")} vector-effect="non-scaling-stroke" />}</For></svg>
        <Show when={mode() === "comment" ? hover() : undefined}>{(item) => {
          const box = () => media()?.getBoundingClientRect()
          const stageBox = () => stage?.getBoundingClientRect()
          return <Show when={box() && stageBox()}><span data-slot="artifact-annotation-highlight" style={{ left: `${box()!.left - stageBox()!.left + item().rect.x}px`, top: `${box()!.top - stageBox()!.top + item().rect.y}px`, width: `${item().rect.width}px`, height: `${item().rect.height}px` }}><small>{item().tag}</small></span></Show>
        }}</Show>
        <For each={notes()}>{(note, index) => <span aria-hidden="true" data-slot="artifact-annotation-pin" style={{ left: `${project(note).left}%`, top: `${project(note).top}%` }}>{index() + 1}</span>}</For>
        <Show when={selected()}>{(note) => <>
          <span aria-hidden="true" data-slot="artifact-annotation-pin" style={{ left: `${project(note()).left}%`, top: `${project(note()).top}%` }}>{notes().length + 1}</span>
          <form data-slot="artifact-annotation-form" style={{ left: `clamp(12px, ${project(note()).left}%, calc(100% - 260px))`, top: `clamp(12px, ${project(note()).top}%, calc(100% - 88px))` }} onSubmit={(event) => { event.preventDefault(); void submitComments() }}>
            <input aria-label={ctx.t("view.annotate.label")} data-slot="artifact-annotation-input" placeholder={ctx.t("view.annotate.placeholder")} value={note().comment} onInput={(event) => setSelected({ ...note(), comment: event.currentTarget.value })} />
          </form>
        </>}</Show>
      </Show>
    </div>
  )
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}
