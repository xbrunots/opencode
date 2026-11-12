import { batch, createSignal, onCleanup, onMount, Show } from "solid-js"
import { createKeyed, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { useMarkdown } from "@opencode/session-ui/context/markdown"
import { safeHtmlPreview } from "@opencode/session-ui/safe-html-preview"
import { ArtifactAnnotation } from "./artifact-view-annotation"
import { HtmlPreview } from "./preview-ipc"

/** The same isolated HTML view used by the file panel, mounted inside a conversation. */
export function ChatHtmlPreview(props: { session: MountedSession; path: string; inline?: string; fallback: () => void }) {
  const ctx = usePlugin()
  const embeds = ctx.embeds
  const ipc = ctx.main(HtmlPreview)
  const markdown = useMarkdown()
  const [id, setID] = createSignal<string>()
  const [visible, setVisible] = createSignal(false)
  const [intersecting, setIntersecting] = createSignal(false)
  const [frozen, setFrozen] = createSignal(false)
  const [still, setStill] = createSignal<string>()
  const [staticHTML, setStaticHTML] = createSignal<string>()
  let root: HTMLDivElement | undefined
  let alive = true
  let opened: string | undefined
  let attempt = 0
  let pending = false
  let captured = false

  const capture = (id: string) => {
    let timer: number | undefined
    const deadline = new Promise<undefined>((resolve) => {
      timer = setTimeout(resolve, 750)
    })

    return Promise.race([embeds.capture(id), deadline])
      .then((bytes) => {
        if (!alive || !bytes?.length) return false
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }))
        const old = still()

        setStill(url)
        if (old) URL.revokeObjectURL(old)
        return true
      })
      .catch(() => false)
      .finally(() => {
        if (timer) clearTimeout(timer)
      })
  }

  const captureWhenReady = async (id: string) => {
    // Placement reaches Electron asynchronously; an early capture can precede the view becoming visible.
    for (let tries = 0; tries < 6; tries++) {
      if (!alive || opened !== id || !visible() || frozen()) return
      if (await capture(id)) return
      await new Promise<void>((resolve) => setTimeout(resolve, 120))
    }
  }

  onMount(() => {
    if (ctx.app.platform !== "desktop" || !root) return props.fallback()
    const reader = new AbortController()

    if (props.inline !== undefined) setStaticHTML(safeHtmlPreview(props.inline))
    else
      void markdown?.readPreview?.(props.path, reader.signal, props.session.id)
        .then(async (blob) => {
          if (!blob || blob.type !== "text/html" || reader.signal.aborted) return
          const html = await blob.text()

          if (!reader.signal.aborted) setStaticHTML(safeHtmlPreview(html))
        })
        .catch(() => undefined)
    onCleanup(() => reader.abort())
    const viewport = root.closest<HTMLElement>("[data-scrollable]")
    const container = root.parentElement
    const resize = viewport && container
      ? new ResizeObserver(() => {
          container.style.maxHeight = `${Math.max(80, viewport.clientHeight - 64)}px`
        })
      : undefined

    if (resize && viewport) resize.observe(viewport)
    onCleanup(() => resize?.disconnect())
    // Native views are not clipped by the scroll container, so show the live page only when its
    // entire box is visible. This keeps the view from covering the composer or adjacent messages.
    const observer = new IntersectionObserver(
      (entries) => {
        batch(() => {
          setIntersecting(entries.some((entry) => entry.isIntersecting))
          setVisible(entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.999))
        })
      },
      { threshold: [0, 0.999, 1] },
    )

    observer.observe(root)
    onCleanup(() => observer.disconnect())
  })

  createKeyed(() => ({ inView: visible(), intersects: intersecting(), annotating: frozen() }), (state) => {
    const inView = state.inView
    const intersects = state.intersects
    const annotating = state.annotating
    if (inView) captured = false
    if (!inView && intersects && opened && !annotating && !captured) {
      captured = true
      void capture(opened)
    }
    if (!intersects && !annotating) {
      attempt++
      pending = false
      const previous = opened
      if (!previous) return
      opened = undefined
      setID(undefined)
      // Keep the last frame while the native renderer is released outside the scroll viewport.
      void capture(previous).finally(() => void ipc.close({ id: previous }).catch(() => undefined))
      return
    }
    if (!inView || opened || pending) return
    const current = ++attempt
    pending = true
    void ipc.open({
      server: props.session.server.id,
      session: props.session.id,
      path: props.path,
      ...(props.inline === undefined ? {} : { inline: props.inline }),
    }).then(
      (result) => {
        if (!alive || current !== attempt) return void ipc.close({ id: result.id }).catch(() => undefined)
        pending = false
        opened = result.id
        setID(result.id)
        void captureWhenReady(result.id)
      },
      () => {
        if (!alive || current !== attempt) return
        pending = false
        props.fallback()
      },
    )
  })

  onCleanup(() => {
    alive = false
    attempt++
    if (opened) void ipc.close({ id: opened }).catch(() => undefined)
    const image = still()
    if (image) URL.revokeObjectURL(image)
  })

  return (
    <div ref={root} class="relative flex h-full w-full flex-col">
      <ArtifactAnnotation
        sessionID={props.session.id}
        serverID={props.session.server.id}
        path={props.path}
        kind="html"
        native={true}
        previewID={id()}
        onActiveChange={setFrozen}
      >
        <div data-slot="artifact-native-preview" class="relative flex min-h-0 w-full flex-1 flex-col">
          <Show when={!id() || !visible()}>
            <Show
              when={still()}
              fallback={
                <Show when={staticHTML()}>
                  {(html) => <iframe title={props.path} srcdoc={html()} sandbox="" class="absolute inset-0 h-full w-full border-0" />}
                </Show>
              }
            >
              {(image) => <img src={image()} alt="" class="absolute inset-0 h-full w-full object-contain" />}
            </Show>
          </Show>
          <Show when={id()}>
            {(preview) => <embeds.View id={preview()} visible={visible()} frozen={frozen()} page={props.path} class="absolute inset-0" />}
          </Show>
        </div>
      </ArtifactAnnotation>
    </div>
  )
}
