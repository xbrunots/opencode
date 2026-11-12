import { createSignal, onCleanup, Show, type JSX } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"

/** Keep the preview interactive until the user explicitly chooses to mark a point. */
export function ArtifactAnnotation(props: {
  sessionID: string
  serverID: string
  path: string
  native?: boolean
  onActiveChange?: (active: boolean) => void
  children: JSX.Element
}) {
  const ctx = usePlugin()
  const [active, setActive] = createSignal(false)
  const [point, setPoint] = createSignal<{ sessionID: string; serverID: string; path: string; x: number; y: number; left: number; top: number; time?: number }>()
  const [comment, setComment] = createSignal("")
  const [failed, setFailed] = createSignal(false)
  const [outside, setOutside] = createSignal(false)
  let stage: HTMLDivElement | undefined

  onCleanup(() => props.onActiveChange?.(false))

  const cancel = () => {
    setActive(false)
    props.onActiveChange?.(false)
    setPoint(undefined)
    setComment("")
    setFailed(false)
    setOutside(false)
  }

  const select = (clientX: number, clientY: number) => {
    if (!stage) return
    const stageRect = stage.getBoundingClientRect()
    const media = stage.querySelector<HTMLVideoElement | HTMLImageElement | HTMLIFrameElement | HTMLDivElement>("video, img[data-slot='artifact-media'], iframe, [data-slot='artifact-native-preview']")
    const rect = media?.getBoundingClientRect() ?? stageRect

    if (!rect.width || !rect.height) return

    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      setPoint(undefined)
      setOutside(true)

      return
    }

    const clamp = (value: number) => Math.max(0, Math.min(100, value))
    const audio = stage.querySelector<HTMLAudioElement>("audio")
    setPoint({
      sessionID: props.sessionID,
      serverID: props.serverID,
      path: props.path,
      x: clamp(((clientX - rect.left) / rect.width) * 100),
      y: clamp(((clientY - rect.top) / rect.height) * 100),
      left: clamp(((clientX - stageRect.left) / stageRect.width) * 100),
      top: clamp(((clientY - stageRect.top) / stageRect.height) * 100),
      time: media instanceof HTMLVideoElement ? media.currentTime : audio?.currentTime,
    })
    setFailed(false)
    setOutside(false)
    requestAnimationFrame(() => stage?.querySelector<HTMLTextAreaElement>("textarea")?.focus())
  }

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const selected = point()
    const text = comment().trim()

    if (!selected || !text) return

    const annotation = new CustomEvent("opencode:image-annotation", {
      cancelable: true,
      detail: { sessionID: selected.sessionID, serverID: selected.serverID, src: selected.path, x: selected.x, y: selected.y, time: selected.time, comment: text },
    })

    window.dispatchEvent(annotation)

    if (!annotation.defaultPrevented) return setFailed(true)

    cancel()
  }

  return (
    <div ref={stage} data-slot="artifact-annotation-stage" data-native={props.native ? "" : undefined}>
      <Show when={props.native}>
        <div data-slot="artifact-annotation-toolbar">
          <Show when={!active()}>
            <button type="button" data-slot="artifact-annotation-native-open" onClick={() => {
              setActive(true)
              props.onActiveChange?.(true)
            }}>
              {ctx.t("view.annotate")}
            </button>
          </Show>
        </div>
      </Show>
      {props.children}
      <Show when={!active() && !props.native}>
        <button type="button" data-slot="artifact-annotation-open" onClick={() => {
          setActive(true)
          props.onActiveChange?.(true)
        }}>
          {ctx.t("view.annotate")}
        </button>
      </Show>
      <Show when={active()}>
        <button
          type="button"
          data-slot="artifact-annotation-target"
          aria-label={ctx.t("view.annotate.hint")}
          onClick={(event) => {
            const rect = (stage?.querySelector("video, img[data-slot='artifact-media'], iframe, [data-slot='artifact-native-preview']") ?? event.currentTarget).getBoundingClientRect()
            select(event.detail === 0 ? rect.left + rect.width / 2 : event.clientX, event.detail === 0 ? rect.top + rect.height / 2 : event.clientY)
          }}
        >
          <span data-slot="artifact-annotation-hint" role="status">{ctx.t(outside() ? "view.annotate.outside" : "view.annotate.hint")}</span>
        </button>
        <Show when={point()}>
          {(selected) => (
            <span aria-hidden="true" data-slot="artifact-annotation-pin" style={{ left: `${selected().left}%`, top: `${selected().top}%` }} />
          )}
        </Show>
        <form data-slot="artifact-annotation-form" onSubmit={submit}>
          <label>
            {ctx.t("view.annotate.label")}
            <textarea value={comment()} onInput={(event) => setComment(event.currentTarget.value)} />
          </label>
          <Show when={failed()}><p role="alert">{ctx.t("view.annotate.failed")}</p></Show>
          <div data-slot="artifact-annotation-actions">
            <button type="button" onClick={cancel}>{ctx.t("view.annotate.cancel")}</button>
            <button type="submit" disabled={!point() || !comment().trim()}>{ctx.t("view.annotate.submit")}</button>
          </div>
        </form>
      </Show>
    </div>
  )
}
