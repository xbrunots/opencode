import {
  createEffect,
  createMemo,
  ErrorBoundary,
  For,
  getOwner,
  onCleanup,
  onMount,
  runWithOwner,
  Show,
  untrack,
  type Component,
  type JSX,
  type ParentProps,
} from "solid-js"
import { Portal, render } from "solid-js/web"
import {
  MarkdownProvider,
  type MarkdownReference,
  useMarkdown,
  type MarkdownCodeAction,
  type MarkdownCodeBlock,
  type MarkdownCodeBlocks,
} from "@opencode/session-ui/context/markdown"
import { PreviewPanel } from "@opencode/gui-plugins/file/preview-panel"
import { SourcesProvider } from "@opencode/session-ui/context/sources"
import { sourcesExperiment } from "@opencode/session-ui/sources/experiment"
import { useTheme } from "@opencode/ui/theme/context"
import type { DesktopTheme } from "@opencode/ui/theme/types"
import {
  CodeBlock,
  CodeBlockAction,
  Style,
  Theme,
  type CodeBlockProps,
  type MountedSession,
} from "@opencode/plugin/gui"
import { BuiltinSlot, type BuiltinSlotMap } from "@opencode/plugin/gui/builtin"
import { PluginContext } from "@opencode/plugin/gui/host"
import { usePluginHost, type Item } from "./host"
import { createLinkCheck } from "./link-check"
import { usePlatform } from "@/runtime/platform/platform"
import { useData } from "@/runtime/server/current"
import { showToast } from "@/shell/notifications/toast"

/**
 * Renders one plugin contribution with its context and error isolation: a contribution that throws records the
 * error and renders nothing, then runs `failed`, and the rest of the window keeps working. Contributions render on
 * timeline rows only as code block content, for a block whose language a plugin claimed, once it is complete; the
 * session header slot is per timeline.
 */
export function Contribution(props: { plugin: string; failed?: () => void; children: () => JSX.Element }) {
  const host = usePluginHost()

  return (
    <Show when={host.context(props.plugin)} keyed>
      {(context) => (
        <ErrorBoundary
          fallback={(error) => {
            onMount(() => {
              host.fail(props.plugin, error)
              props.failed?.()
            })

            return null
          }}
        >
          {/* Untracked: a contribution renders once; its own reactivity updates it in place. */}
          <PluginContext.Provider value={context}>{untrack(props.children)}</PluginContext.Provider>
        </ErrorBoundary>
      )}
    </Show>
  )
}

export function PluginSlot<At extends keyof BuiltinSlotMap>(props: {
  at: At
  input: BuiltinSlotMap[At]
  fallback?: JSX.Element
  before?: number
  from?: number
}) {
  const host = usePluginHost()

  const items = createMemo(() =>
    host
      .items(BuiltinSlot)
      .filter((item) => item.value.at === props.at && (props.before === undefined || (item.value.order ?? 0) < props.before) && (props.from === undefined || (item.value.order ?? 0) >= props.from))
      .toSorted((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0)),
  )

  return (
    <For each={items()} fallback={props.fallback}>
      {(item) => (
        <Contribution plugin={item.plugin}>
          {() =>
            // SAFETY: items are filtered to `at === props.at`, and a slot's render takes that slot's input.
            (item.value.render as (input: BuiltinSlotMap[At]) => JSX.Element)(props.input)
          }
        </Contribution>
      )}
    </For>
  )
}

export function PluginStyles() {
  const host = usePluginHost()

  return (
    <Portal mount={document.head}>
      <For each={host.items(Style)}>{(item) => <style data-plugin={item.plugin}>{item.value}</style>}</For>
    </Portal>
  )
}

/**
 * Lists each contributed theme in the theme picker, keyed by plugin, while it is contributed. Once every plugin the
 * window runs has settled (`loaded`: the plugin list has arrived), a selected theme no plugin contributed is not
 * coming, and the theme provider shows the default theme.
 */
export function PluginThemes(props: { loaded: () => boolean }) {
  const host = usePluginHost()
  const theme = useTheme()

  const settled = createMemo(
    () =>
      props.loaded() &&
      host.ready() &&
      host.definitions().every((definition) => {
        if (!definition.windowEntry) return true

        const status = host.status(definition.id)

        return status === "active" || status === "failed" || status === "disabled"
      }),
  )

  // Hands the settled plugin set to the theme provider, outside the plugin host.
  createEffect(() => {
    if (settled()) theme.settle()
  })

  return (
    <For each={host.items(Theme)}>
      {(item) => {
        // SAFETY: an SDK theme has the bundled themes' shape with colors typed as plain strings; the resolver parses
        // any string without throwing (a malformed color resolves to black), so the narrower color types add nothing.
        onCleanup(theme.registerTheme({ ...item.value, id: `${item.plugin}:${item.value.id}` } as DesktopTheme))

        return null
      }}
    </For>
  )
}

/**
 * Routes local markdown links in the session to plugin LinkHandler contributions, keeping image loading, and hands
 * fenced code blocks to plugin CodeBlock and CodeBlockAction contributions. A turn's sources chip opens its turn
 * through the Sources plugin's handler.
 */
export function PluginLinks(props: ParentProps<{ session: MountedSession; active?: boolean }>) {
  const host = usePluginHost()
  const markdown = useMarkdown()
  const platform = usePlatform()
  const data = useData()

  const openReference = (reference: MarkdownReference) => {
    if (reference.type === "directory" || reference.type === "reference") {
      const href = reference.value.replace(/^@/, "")
      if (host.links.open({ href, exact: true, session: props.session })) return
    }

    const panel = host.context("file")?.use(PreviewPanel)()
    if (panel?.status !== "active") return

    if (reference.type === "skill") {
      const skill = data.location.skill.list({ directory: props.session.directory })?.find((item) => item.id === reference.value)
      panel.value.open({
        session: props.session,
        path: skill?.path ?? `${reference.value}/SKILL.md`,
        inline: skill?.content ?? `# ${reference.label}\n\n${reference.description ?? "Skill referenced in this conversation."}`,
        kind: "markdown",
      })

      return
    }

    const title = reference.type === "agent" ? `Agent · ${reference.label}` : `MCP · ${reference.label}`
    panel.value.open({
      session: props.session,
      path: title,
      inline: `# ${title}\n\n${reference.description ?? `${reference.type} referenced in this conversation.`}`,
      kind: "markdown",
    })
  }

  // Checks untracked: markdown calls this inside its render effect, which must not follow the routed session.
  const localFileExists = createLinkCheck(
    () => props.active !== false,
    (href) => host.links.exists({ href, session: props.session }),
  )

  const Links = (inner: ParentProps<{ codeBlocks: MarkdownCodeBlocks | false }>) => (
    <MarkdownProvider
      readImage={markdown?.readImage}
      openLocalFile={(href) => void host.links.open({ href, session: props.session })}
      localFileExists={localFileExists}
      previewSession={props.session.id}
      previewServer={props.session.server.id}
      openPreview={(source, local, destination, inline) => {
        if (destination === "panel") {
          const artifact = /(?:^|\/)api\/experimental\/artifacts\/art_[a-zA-Z0-9]{26}\/view(?:\/|$)/.test(source)
          const html = inline !== undefined || (local && /\.html?$/i.test(source))

          if (html || artifact) {
            const panel = host.context("file")?.use(PreviewPanel)()

            if (panel?.status === "active")
              panel.value.open({ session: props.session, path: source, inline, kind: artifact ? "artifact" : "html" })
            else showToast({ title: "Não foi possível abrir a prévia." })

            return
          }

          host.links.open({ href: source, origin: local ? "file" : "browser", session: props.session })

          return
        }

        if (!local) return platform.openExternal(source)

        if (!props.session.server.local) {
          showToast({ title: "Abrir no aplicativo padrão não está disponível para arquivos de servidores remotos." })

          return
        }

        const absolute = /^([a-z]:[\\/]|\/)/i.test(source)
        void platform.openPath?.(absolute ? source : `${props.session.directory}/${source}`)
      }}
      openReference={openReference}
      codeBlocks={inner.codeBlocks}
    >
      {inner.children}
    </MarkdownProvider>
  )

  const codeBlocks = createCodeBlocks(() => props.session, Links)

  return (
    <Links codeBlocks={codeBlocks}>
      <SourcesProvider
        enabled={sourcesExperiment.enabled}
        icons={sourcesExperiment.icons}
        onOpen={(from) => void host.links.open({ href: from, origin: "sources", session: props.session })}
      >
        {props.children}
      </SourcesProvider>
    </Links>
  )
}

/**
 * The `CodeBlock` renderers and `CodeBlockAction` buttons for the session's Markdown, by language. Markdown asks only
 * for complete blocks of a listed language. Content renders inside `Provider` with code block content off, under the
 * plugin's error isolation: a render that throws or declines shows the code again.
 */
function createCodeBlocks(
  session: () => MountedSession,
  Provider: Component<ParentProps<{ codeBlocks: false }>>,
): MarkdownCodeBlocks {
  const host = usePluginHost()
  const owner = getOwner()
  const wrapped = new WeakMap<Item<CodeBlockAction>, MarkdownCodeAction>()

  // The renderer each language goes to and the action buttons; a new value only when one of them changes, so markdown
  // decorates its blocks again only then.
  const current = createMemo(
    () => {
      const renderers = new Map<string, Item<CodeBlock>>()
      host.items(CodeBlock).forEach((item) =>
        item.value.languages.forEach((language) => {
          const key = language.toLowerCase()

          if (!renderers.has(key)) renderers.set(key, item)
        }),
      )
      const actions = host.items(CodeBlockAction).toSorted((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0))

      return {
        renderers,
        items: actions,
        render: new Set(renderers.keys()),
        actions: new Set(actions.flatMap((item) => item.value.languages.map((language) => language.toLowerCase()))),
      }
    },
    undefined,
    {
      equals: (a, b) =>
        a.items.length === b.items.length &&
        a.items.every((item, index) => item === b.items[index]) &&
        a.renderers.size === b.renderers.size &&
        [...a.renderers].every(([language, item]) => b.renderers.get(language) === item),
    },
  )

  const input = (block: MarkdownCodeBlock): CodeBlockProps => ({
    code: block.code,
    language: block.language,
    get session() {
      return session()
    },
  })

  const action = (item: Item<CodeBlockAction>) => {
    const known = wrapped.get(item)

    if (known) return known

    // Getters, so a title read from the locale follows it.
    const next: MarkdownCodeAction = {
      get icon() {
        return item.value.icon
      },
      get title() {
        return item.value.title
      },
      run: (block) =>
        void Promise.try(() => item.value.run(input(block))).catch((cause: unknown) =>
          console.error(`[plugin] ${item.plugin}`, cause),
        ),
    }

    wrapped.set(item, next)

    return next
  }

  return {
    current,
    render(target, block, fallback) {
      const item = untrack(current).renderers.get(block.language)

      if (!item) return

      return runWithOwner(owner, () =>
        render(
          () => (
            <Provider codeBlocks={false}>
              <Contribution plugin={item.plugin} failed={fallback}>
                {() => {
                  const view = item.value.render(input(block))

                  // Declined: markdown shows the code again once this render returns.
                  if (view === undefined || view === null) queueMicrotask(fallback)

                  return view
                }}
              </Contribution>
            </Provider>
          ),
          target,
        ),
      )
    },
    actions: (language) =>
      current()
        .items.filter((item) => item.value.languages.some((name) => name.toLowerCase() === language))
        .map(action),
  }
}
