import { batch, createSignal, onCleanup, onMount, Show } from "solid-js"
import { createKeyed, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Markdown } from "@opencode/session-ui/markdown"
import { MarkdownProvider } from "@opencode/session-ui/context/markdown"
import { useMarkdown } from "@opencode/session-ui/context/markdown"
import { safeHtmlPreview } from "@opencode/session-ui/safe-html-preview"
import { getDirectory } from "@opencode/util/path"
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

  createKeyed(() => ({ id: id(), mode: ctx.appearance.mode() }), (target) => {
    if (target.id) void ipc.appearance({ id: target.id, mode: target.mode }).catch(() => undefined)
  })

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

    const preview = props.inline === undefined
      ? { server: props.session.server.id, session: props.session.id, path: props.path }
      : { server: props.session.server.id, session: props.session.id, path: props.path, inline: props.inline }

    void ipc.open(preview).then(
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

/** Opens a published artifact as its native HTML view or as an annotated image, video, or PDF. */
export function ChatArtifactPreview(props: { session: MountedSession; path: string; fallback: () => void }) {
  const markdown = useMarkdown()
  const [html, setHTML] = createSignal(false)
  const [media, setMedia] = createSignal<{ src: string; type: string }>()
  let objectURL: string | undefined

  onMount(() => {
    const reader = new AbortController()
    const read = markdown?.readPreview

    if (!read) {
      props.fallback()

      return
    }

    void read(props.path, reader.signal, props.session.id).then(
      (blob) => {
        if (reader.signal.aborted) return

        if (!blob) return props.fallback()

        if (blob.type === "text/html") return setHTML(true)

        if (!blob.type.startsWith("image/") && !blob.type.startsWith("video/") && blob.type !== "application/pdf")
          return props.fallback()
        objectURL = URL.createObjectURL(blob)
        setMedia({ src: objectURL, type: blob.type })
      },
      () => {
        if (!reader.signal.aborted) props.fallback()
      },
    )

    onCleanup(() => {
      reader.abort()

      if (objectURL) URL.revokeObjectURL(objectURL)
    })
  })

  return (
    <Show
      when={html()}
      fallback={
        <Show when={media()} fallback={<div class="h-full min-h-0 animate-pulse rounded-md bg-background-weak" aria-busy="true" />}>
          {(value) => (
            <ArtifactAnnotation
              sessionID={props.session.id}
              serverID={props.session.server.id}
              path={props.path}
              kind={value().type.startsWith("image/") ? "image" : value().type.startsWith("video/") ? "video" : "pdf"}
            >
              <div class="flex h-full min-h-0 w-full items-center justify-center overflow-auto bg-background-stronger">
                <Show
                  when={value().type.startsWith("image/")}
                  fallback={
                    <Show
                      when={value().type.startsWith("video/")}
                      fallback={<iframe title={props.path} src={value().src} class="h-full w-full border-0" />}
                    >
                      <video data-slot="artifact-media" src={value().src} controls class="max-h-full max-w-full" />
                    </Show>
                  }
                >
                  <img data-slot="artifact-media" src={value().src} alt={props.path} class="max-h-full max-w-full object-contain" />
                </Show>
              </div>
            </ArtifactAnnotation>
          )}
        </Show>
      }
    >
      <ChatHtmlPreview session={props.session} path={props.path} fallback={props.fallback} />
    </Show>
  )
}

/** Renders referenced skills and other Markdown documents in the same internal preview surface. */
export function ChatMarkdownPreview(props: { session: MountedSession; path: string; text: string }) {
  const ctx = usePlugin()
  const parent = useMarkdown()
  const base = props.path.includes("/") || props.path.includes("\\") ? getDirectory(props.path) : ""
  const resolve = (href: string) => (/^([a-z]:)?\//i.test(href) ? href : [base, href].filter(Boolean).join("/"))

  return (
    <MarkdownProvider
      readImage={(src, signal) => parent?.readImage?.(resolve(src), signal) ?? Promise.resolve(undefined)}
      openLocalFile={(href) => void ctx.links.open({ href: resolve(href), session: props.session })}
      localFileExists={(href) => ctx.links.exists({ href: resolve(href), session: props.session })}
      previewSession={props.session.id}
      previewServer={props.session.server.id}
    >
      <div data-scrollable data-slot="chat-markdown-preview" class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <Markdown text={props.text} />
      </div>
    </MarkdownProvider>
  )
}
