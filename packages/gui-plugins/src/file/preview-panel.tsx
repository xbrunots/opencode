import { createSignal, lazy, Show, Suspense, untrack } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Contract, createKeyed, type MountedSession, type Plugin, usePanel } from "@opencode/plugin/gui"
import { BuiltinPanel } from "@opencode/plugin/gui/builtin"
import { Icon } from "@opencode/ui/icon"
import { uuid } from "@opencode/util/uuid"
import type File from "./index"

type Preview = { session: string; path: string; inline?: string; kind: "html" | "artifact" | "markdown" }

export const PreviewPanel = Contract.define<{
  open(input: { session: MountedSession; path: string; inline?: string; kind: "html" | "artifact" | "markdown" }): void
}, "file.previewPanel">("file.previewPanel")

/** Preview-only tabs are scoped to their originating session and are discarded on close or reload. */
export const setupPreviewPanel: Plugin.Setup<typeof File> = (ctx) => {
  const [previews, setPreviews] = createStore<Record<string, Preview>>({})
  const View = lazy(() => import("./chat-preview").then((module) => ({ default: module.ChatHtmlPreview })))
  const Artifact = lazy(() => import("./chat-preview").then((module) => ({ default: module.ChatArtifactPreview })))
  const Markdown = lazy(() => import("./chat-preview").then((module) => ({ default: module.ChatMarkdownPreview })))

  ctx.add(BuiltinPanel, {
    id: "artifact-preview",
    region: "side",
    transient: true,
    list(input) {
      return input.open.flatMap((id) => {
        const preview = previews[id]
        if (!preview || preview.session !== input.session.key) return []
        return [{ id, title: preview.path, closable: "compact" as const, fallback: true }]
      })
    },
    close(input) {
      setPreviews(produce((draft) => { delete draft[input.tab.id] }))
    },
    render(props) {
      const panel = usePanel()
      const [failed, setFailed] = createSignal(false)
      let root: HTMLDivElement | undefined
      createKeyed(
        () => panel.visible() ? props.tab.id : undefined,
        () => {
          if (untrack(panel.sidebar.opened)) panel.sidebar.toggle()
        },
      )
      return (
        <Show when={previews[props.tab.id]} keyed>
          {(preview) => (
            <div ref={root} class="flex h-full min-h-0 flex-col">
              <div class="flex h-10 shrink-0 items-center justify-between border-b border-border-weak-base px-4">
                <span class="truncate text-13-medium">{preview.path}</span>
                <button type="button" aria-label={ctx.t("view.annotate")} onClick={() => root?.querySelector('[data-slot="artifact-annotation-stage"]')?.dispatchEvent(new Event("opencode-preview-edit"))}>
                  <Icon name="edit" size="small" />
                </button>
              </div>
              <Show when={!failed()} fallback={<p class="p-4 text-text-weak">{ctx.t("view.loadFailed")}</p>}>
                <Suspense fallback={<div class="min-h-0 flex-1 animate-pulse bg-background-weak" aria-busy="true" />}>
                  <Show when={preview.kind === "markdown"} fallback={
                    <Show when={preview.kind === "artifact"} fallback={
                      <View session={props.session} path={preview.path} inline={preview.inline} fallback={() => setFailed(true)} />
                    }>
                      <Artifact session={props.session} path={preview.path} fallback={() => setFailed(true)} />
                    </Show>
                  }>
                    <Markdown session={props.session} path={preview.path} text={preview.inline ?? ""} />
                  </Show>
                </Suspense>
              </Show>
            </div>
          )}
        </Show>
      )
    },
  })

  ctx.provide(PreviewPanel, {
    open(input) {
      const id = `artifact-preview-${uuid()}`
      setPreviews(id, { session: input.session.key, path: input.path, inline: input.inline, kind: input.kind })
      ctx.layout.open(`file:${id}`, input.session)
    },
  })
}
