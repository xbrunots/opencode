import { createSignal, Show } from "solid-js"
import { render } from "solid-js/web"
import { DialogProvider } from "@opencode/ui/context/dialog"
import { I18nProvider, useI18n } from "@opencode/ui/context/i18n"
import { Markdown } from "../src/components/markdown"
import { preloadMarkdown } from "../src/components/markdown-cache"
import { MarkdownProvider, type MarkdownLocalFileExists } from "../src/context/markdown"
import { OpenCode } from "@opencode/client/promise"
import { readLocalImage } from "../../app/src/runtime/server/image"
import { CurrentUserMessageDisplay } from "../src/message/message-content"
import { CurrentSessionProviders } from "../src/storybook/current-session-story"
import { CURRENT_SESSION_ID, STORY_MODEL, STORY_TIME } from "../src/storybook/current-session-fixtures"

export {
  getCachedMarkdown,
  getReadyMarkdown,
  renderCachedMarkdown,
  sanitizeMarkdown,
  touchCachedMarkdown,
} from "../src/components/markdown-cache"

export { renderMermaidSvg } from "../src/components/markdown-mermaid"

export { MarkdownWorkerDisposedError } from "../src/components/markdown-worker"

export { preloadMarkdown }

export function mountVideoAttachment() {
  const host = document.createElement("div")
  host.dataset.testid = "video-fixture"
  document.body.appendChild(host)
  const message = {
    id: "msg_video_fixture", type: "user" as const, text: "Vídeo anexado", time: { created: STORY_TIME },
    files: [{ name: "demo.webm", mime: "video/webm", data: "AAAA", source: { type: "inline" as const } }],
  }
  const fixtureDocument = { sessionID: CURRENT_SESSION_ID, messages: [message], status: { type: "idle" as const }, diffs: [] }
  render(() => (
    <DialogProvider>
      <MarkdownProvider>
        <CurrentSessionProviders document={fixtureDocument}>
          <CurrentUserMessageDisplay sessionID={CURRENT_SESSION_ID} message={message} text={message.text} agent="build" model={STORY_MODEL} actions={{ openAttachment: () => { window.document.body.dataset.videoSaved = "true" } }} />
        </CurrentSessionProviders>
      </MarkdownProvider>
    </DialogProvider>
  ), host)
}

// Inline code naming one of these is a file link; any other path stays plain code.
const existingFiles = new Set(["src/file.ts", "new/file.ts"])

export async function mountMarkdown(options: {
  text: string
  streaming?: boolean
  cached?: boolean
  images?: boolean
  fixtureImages?: boolean
  previews?: boolean
  nativePreviewFailure?: boolean
  synchronousFiles?: boolean
  localFileExists?: MarkdownLocalFileExists
}) {
  if (options.cached) await preloadMarkdown(options.text, "markdown-test")
  const host = document.createElement("div")
  host.dataset.testid = "markdown-fixture"
  document.body.appendChild(host)
  render(() => {
    const api = OpenCode.make({
      baseUrl: location.origin,
      headers: { Authorization: `Basic ${btoa("opencode:fixture")}` },
    })

    const [text, setText] = createSignal(options.text)
    const [streaming, setStreaming] = createSignal(options.streaming ?? false)
    const [visible, setVisible] = createSignal(true)
    const [german, setGerman] = createSignal(false)
    const english = useI18n()

    return (
      <DialogProvider>
        <textarea aria-label="Markdown text" value={text()} onInput={(event) => setText(event.currentTarget.value)} />
        <input
          aria-label="Streaming"
          type="checkbox"
          checked={streaming()}
          onChange={(event) => setStreaming(event.currentTarget.checked)}
        />
        <input
          aria-label="German"
          type="checkbox"
          checked={german()}
          onChange={(event) => setGerman(event.currentTarget.checked)}
        />
        <button onClick={() => setVisible((value) => !value)}>Toggle Markdown</button>
        <I18nProvider
          value={{
            locale: () => (german() ? "de" : "en"),
            t: (key, params) => (german() && key === "ui.message.copy" ? "Kopieren" : english.t(key, params)),
            plural: english.plural,
            pluralForm: english.pluralForm,
          }}
        >
          <MarkdownProvider
            readImage={(path, signal) => {
              if (options.fixtureImages) {
                const width = path.includes("wide") ? 2400 : 60
                return Promise.resolve(
                  new Blob(
                    [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="120"><rect width="100%" height="100%" fill="#777"/></svg>`],
                    { type: "image/svg+xml" },
                  ),
                )
              }
              return options.images ? readLocalImage(api, "C:/project", path, signal) : Promise.resolve(undefined)
            }}
            readPreview={options.previews ? async () => new Blob([
              '<style>body{margin:0} #target{width:100%;height:180px;background:#ddd}</style><div id="target">Hello</div><script>parent.document.body.dataset.previewScript = "ran"</script>',
            ], { type: "text/html" }) : undefined}
            previewSession="fixture-session"
            previewServer="fixture-server"
            renderPreview={options.nativePreviewFailure ? (_target, _source, fallback) => {
              queueMicrotask(fallback)
              return () => { document.body.dataset.nativePreviewDisposed = "true" }
            } : undefined}
            openPreview={(source, local, destination) => {
              document.body.dataset.previewOpen = `${source}:${local}:${destination}`
            }}
            localFileExists={(path) =>
              options.localFileExists?.(path) ??
              (options.synchronousFiles ? existingFiles.has(path) : Promise.resolve(existingFiles.has(path)))
            }
          >
            <Show when={visible()}>
              <Markdown
                text={text()}
                streaming={streaming()}
                cacheKey={options.cached ? "markdown-test" : undefined}
                deferUntilReady
              />
            </Show>
          </MarkdownProvider>
        </I18nProvider>
      </DialogProvider>
    )
  }, host)

  // Capture before Promise callbacks run: eventual assertions cannot catch a flash on insertion.
  return Array.from(host.querySelectorAll<HTMLElement>(":not(pre) > code"), (node) => ({
    text: node.textContent,
    kind: node.dataset.inlineCodeKind ?? null,
  }))
}
