import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  createUniqueId,
  For,
  on,
  onCleanup,
  Show,
  type ParentProps,
} from "solid-js"
import { Option, Schema } from "effect"
import type { McpServer, SessionMessageInfo } from "@opencode/client/promise"
import { turnSources } from "@opencode/session-ui/sources"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { FileIcon } from "@opencode/ui/file-icon"
import { Loader } from "@opencode/ui/loader"
import { Tooltip } from "@opencode/ui/tooltip"
import { ImagePreview } from "@opencode/ui/image-preview"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { getFilename } from "@opencode/util/path"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useData, useServer } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { usePluginHost } from "@/runtime/plugin/host"
import { usePluginAttachment } from "@/runtime/plugin/host-apis"
import { useCommand } from "@/shell/commands/command"
import { useWorkspaceViews } from "@/shell/workspace-views"
import { useSessionLayout } from "@/session/session-layout"
import { showToast } from "@/shell/notifications/toast"
import { ProviderModelIcon } from "@/providers/models/provider-group"
import { DialogMcp } from "@/providers/connect/mcp-dialog"
import { globalConfigDirectory, serviceConfigFile } from "@opencode/gui-plugins/details/config-file"
import { useTabs } from "@/shell/tabs/tabs"
import { useRoutedSessionTargetParams, useSessionTargetFocused, useSessionTargetFloating } from "@/session/target"
import { useOpenSessionRoute } from "@/session/session-identity-header"
import "./conversation-context.css"

type ContextFile = { key: string; name: string; href?: string; data?: string; mime?: string }
type ContextSkill = { id: string; name: string; text?: string; count: number; automatic?: boolean }

const decodeCall = Schema.decodeUnknownOption(
  Schema.Struct({
    tool: Schema.String,
    status: Schema.Literals(["running", "completed", "error"]),
    input: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  }),
)
const decodeServer = Schema.decodeUnknownOption(Schema.Struct({ server: Schema.String }))

/** Projects only recorded conversation facts; the live MCP catalog resolves namespaces, not usage. */
export function conversationContextFacts(
  messages: readonly SessionMessageInfo[],
  servers: readonly Pick<McpServer, "name">[],
) {
  const assistants = messages.filter((message) => message.type === "assistant")
  const files = new Map<string, ContextFile>()
  messages.forEach((message) => {
    if (message.type !== "user") return
    message.files?.forEach((file, index) => {
      const href = file.source.type === "uri" ? file.source.uri : undefined
      const key = href ?? `${message.id}:${index}`
      files.set(key, {
        key,
        name: file.name ?? (href ? getFilename(href) : file.mime),
        href,
        data: file.data,
        mime: file.mime,
      })
    })
  })
  const tools = assistants.flatMap((message) =>
    message.content.flatMap((part) =>
      part.type === "tool" && part.executed !== false && part.state.status !== "streaming" ? [part] : [],
    ),
  )
  const artifacts = new Map<string, ContextFile>()
  tools.forEach((tool) => {
    if (tool.state.status !== "completed") return
    tool.state.content.forEach((content) => {
      if (content.type !== "file") return
      artifacts.set(content.uri, {
        key: content.uri,
        name: content.name ?? getFilename(content.uri),
        href: content.uri,
        mime: content.mime,
      })
    })
  })

  const loaded = messages.flatMap((message) =>
    message.type === "skill" ? [{ id: message.skill, name: message.name, text: message.skill.startsWith("opencodex-motion:") ? undefined : message.text }] : [],
  )
  const attached = messages.flatMap((message) => (message.type === "user" ? (message.skills ?? []) : []))
  const skills = new Map<string, ContextSkill>()
  attached.concat(loaded).forEach((skill) => {
    const existing = skills.get(skill.id)
    if (!existing) skills.set(skill.id, { id: skill.id, name: skill.name, text: skill.text, count: 0, ...(skill.id.startsWith("opencodex-motion:") ? { automatic: true } : {}) })
    if (existing?.automatic) existing.name = skill.name
    if (skill.text) skills.get(skill.id)!.text = skill.text
  })
  skills.forEach((skill) => {
    skill.count =
      loaded.filter((item) => item.id === skill.id).length || attached.filter((item) => item.id === skill.id).length
  })

  const namespaces = servers
    .map((server) => ({ name: server.name, namespace: server.name.replace(/[^a-zA-Z0-9_-]/g, "_") }))
    .sort((a, b) => b.namespace.length - a.namespace.length)
  const mcps = new Map<string, number>()
  const record = (name: string, input: Record<string, unknown>) => {
    const server =
      namespaces.find((item) => name.startsWith(`${item.namespace}_`) || name.startsWith(`${item.namespace}.`))?.name ??
      (/^opencode[_.](read_mcp_resource|list_mcp_resources|watch_mcp_event)$/.test(name)
        ? Option.getOrUndefined(decodeServer(input))?.server
        : undefined)
    if (server && servers.some((item) => item.name === server)) mcps.set(server, (mcps.get(server) ?? 0) + 1)
  }
  tools.forEach((tool) => {
    if (tool.state.status === "streaming") return
    record(tool.name, tool.state.input)
    if (tool.name !== "execute" || !("metadata" in tool.state)) return
    const calls = tool.state.metadata?.toolCalls
    if (!Array.isArray(calls)) return
    calls.flatMap((call) => Option.toArray(decodeCall(call))).forEach((call) => record(call.tool, call.input ?? {}))
  })
  return {
    sources: turnSources(assistants).sources,
    files: [...files.values()],
    artifacts: [...artifacts.values()],
    skills: [...skills.values()],
    mcps: [...mcps].map(([name, count]) => ({ name, count })),
  }
}

export function ConversationContext() {
  const params = useRoutedSessionTargetParams()
  const focused = useSessionTargetFocused()
  const floating = useSessionTargetFloating()
  const views = useWorkspaceViews()
  const { view } = useSessionLayout()
  const data = useData()
  const sdk = useServerSDK()
  const server = useServer()
  const language = useLanguage()
  const platform = usePlatform()
  const command = useCommand()
  const tabs = useTabs()
  const [skillQuery, setSkillQuery] = createSignal("")
  const dialog = useDialog()
  const host = usePluginHost()
  const attachment = usePluginAttachment()
  const openSession = useOpenSessionRoute()
  const cardID = createUniqueId()
  let trigger: HTMLButtonElement | undefined
  let diffAbort: AbortController | undefined
  const [card, setCard] = createSignal<{ status: "open" } | { status: "closed" }>({
    status: floating ? "closed" : "open",
  })
  const visible = () => views.mode() === "focus" && focused()
  const sideOpened = () => view().side.opened()
  const opened = () => visible() && !sideOpened() && card().status === "open"
  const info = () => data.session.get(params.id)
  const directory = () => info()?.location.directory
  const messages = () => data.session.message.list(params.id)
  const project = () => {
    const current = info()
    return current ? server.ctx.projects.forSession(current) : undefined
  }
  const projectName = () =>
    project()?.name ?? getFilename(project()?.worktree ?? directory()) ?? language.t("context.project")
  const branch = () => {
    const dir = directory()
    return dir ? data.location.vcs.info({ directory: dir })?.branch.current : undefined
  }
  const servers = () => {
    const dir = directory()
    return dir ? data.location.mcp.server.list({ directory: dir }) : undefined
  }
  const catalog = () => {
    const dir = directory()
    return dir ? data.location.skill.list({ directory: dir }) : undefined
  }
  const filteredSkills = createMemo(() => {
    const query = skillQuery().trim().toLocaleLowerCase()
    return (catalog() ?? [])
      .filter((skill) => !query || skill.name.toLocaleLowerCase().includes(query))
      .toSorted((a, b) => a.name.localeCompare(b.name))
  })
  const [plugins, pluginActions] = createResource(
    () => (opened() && directory() ? directory() : undefined),
    async (dir) =>
      (await sdk.api.plugin.list({ location: { directory: dir } })).data.filter(
        (plugin) => plugin.source.type !== "builtin",
      ),
  )
  createEffect(() => {
    const dir = directory()
    if (!opened() || !dir) return
    const off = sdk.event.on("plugin.updated", (event) => {
      if (!event.location || event.location.directory === dir) void pluginActions.refetch()
    })
    onCleanup(off)
  })
  const extensionAction = async (service: "mcp" | "plugins" | "skills", action: "setup" | "config") => {
    const dir = directory()
    if (!dir) return
    try {
      const entries = await sdk.api.config.get({ location: { directory: dir } })
      if (action === "setup") {
        const prompt =
          service === "mcp"
            ? language.t("context.setupMcpPrompt")
            : service === "plugins"
              ? language.t("context.setupPluginPrompt")
              : language.t("context.setupSkillPrompt")
        await tabs.newDraft({ server: server.key, directory: globalConfigDirectory(entries, dir) }, prompt)
        return
      }
      const path = serviceConfigFile(entries, service)
      if (!path) throw new Error(language.t("context.configMissing"))
      if (server.isLocal) {
        if (host.links.open({ href: path, exact: true, session: attachment.current() })) return
        if (platform.revealPath) {
          await platform.revealPath(path)
          return
        }
        throw new Error(language.t("context.openFailed"))
      }
      if (platform.writeClipboardText) await platform.writeClipboardText(path)
      else await navigator.clipboard.writeText(path)
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("context.openFailed"),
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }
  const facts = createMemo(() =>
    conversationContextFacts(visible() ? messages() : [], visible() ? (servers() ?? []) : []),
  )
  const children = () =>
    data.session.list().filter((session) => session.parentID === params.id && !session.time.archived)

  createEffect(
    on(
      () => params.id,
      () => setCard({ status: floating ? "closed" : "open" }),
    ),
  )
  createEffect(
    on(
      sideOpened,
      (open) => {
        if (!open && !floating) setCard({ status: "open" })
      },
      { defer: true },
    ),
  )
  const close = () => {
    setCard({ status: "closed" })
    trigger?.focus({ preventScroll: true })
  }
  const [synced, syncActions] = createResource(
    () => (opened() && directory() ? { id: params.id, directory: directory()! } : undefined),
    async (target) => {
      const result = await Promise.allSettled([
        data.project.sync(),
        data.location.syncInfo({ directory: target.directory }),
        data.session.sync(target.id, { children: true }),
        data.session.message.sync(target.id),
        data.location.vcs.sync({ directory: target.directory }),
        data.location.mcp.server.sync({ directory: target.directory }),
        data.location.skill.sync({ directory: target.directory }),
      ])
      if (data.session.message.more(target.id)) {
        const history = await Promise.allSettled([data.session.message.loadMore(target.id, { all: true })])
        return [...result, ...history].some((item) => item.status === "rejected")
      }
      return result.some((item) => item.status === "rejected")
    },
  )
  const range = createMemo(() => {
    const users = messages().filter((message) => message.type === "user")
    return { from: users.at(0)?.id, to: users.at(-1)?.id }
  })
  const [diffs, diffActions] = createResource(
    () =>
      opened() && info()
        ? {
            id: params.id,
            from: range().from,
            to: range().to,
            updated: info()?.time.updated,
            running: data.session.status(params.id),
          }
        : undefined,
    async (target) => {
      diffAbort?.abort()
      diffAbort = new AbortController()
      return sdk.api.session.diff(
        { sessionID: target.id, from: target.from, to: target.to },
        { signal: diffAbort.signal },
      )
    },
  )
  const [working, workingActions] = createResource(
    () => (opened() && directory() ? { directory: directory()! } : undefined),
    (target) => sdk.api.vcs.diff({ location: { directory: target.directory }, mode: "working" }),
  )
  createEffect(() => {
    const dir = directory()
    if (!opened() || !dir) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        void workingActions.refetch()
        void diffActions.refetch()
      }, 250)
    }
    const offFiles = sdk.event.location(dir).on("filesystem.changed", refresh)
    const offBranch = sdk.event.location(dir).on("vcs.branch.updated", refresh)
    onCleanup(() => {
      clearTimeout(timer)
      offFiles()
      offBranch()
    })
  })
  onCleanup(() => diffAbort?.abort())
  const changed = () => {
    const files = new Map((diffs.error ? [] : (diffs() ?? [])).map((file) => [file.file, file]))
    for (const file of working.error ? [] : (working()?.data ?? [])) files.set(file.file, file)
    return [...files.values()]
  }
  const additions = () => changed().reduce((total, file) => total + file.additions, 0)
  const deletions = () => changed().reduce((total, file) => total + file.deletions, 0)
  const open = (file: ContextFile) => {
    if (file.href && host.links.open({ href: file.href, exact: true, session: attachment.current() })) return
    if (file.href && /^https?:\/\//.test(file.href)) return platform.openExternal(file.href)
    if (file.data && file.mime?.startsWith("image/"))
      return dialog.show(() => <ImagePreview src={`data:${file.mime};base64,${file.data}`} alt={file.name} />)
    if (file.data) {
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(file.data), (char) => char.charCodeAt(0))], { type: file.mime }),
      )
      const link = document.createElement("a")
      link.href = url
      link.download = file.name
      link.click()
      URL.revokeObjectURL(url)
      return
    }
    showToast({ variant: "error", title: language.t("context.openFailed"), description: file.name })
  }
  const openSkill = (skill: ContextSkill) => {
    const dir = directory()
    const catalog = dir ? data.location.skill.list({ directory: dir })?.find((item) => item.id === skill.id) : undefined
    if (catalog && host.links.open({ href: catalog.path, exact: true, session: attachment.current() })) return
    dialog.show(() => (
      <Dialog>
        <DialogHeader>
          <DialogTitleGroup title={skill.name} />
        </DialogHeader>
        <DialogBody>
          <div class="conversation-context-skill">
            {skill.text ?? catalog?.content ?? language.t("context.detailsUnavailable")}
          </div>
        </DialogBody>
      </Dialog>
    ))
  }
  const fileRow = (file: ContextFile) => (
    <button type="button" class="conversation-context-item" title={file.href ?? file.name} onClick={() => open(file)}>
      <FileIcon node={{ path: file.name, type: "file" }} class="size-4" />
      <span>{file.name}</span>
      <Icon name="chevron-right" class="conversation-context-trailing" />
    </button>
  )

  return (
    <Show when={visible()}>
      <div class="conversation-context-anchor">
        <Tooltip placement="bottom" value={language.t("context.title")}>
          <IconButton
            ref={trigger}
            type="button"
            variant="ghost-muted"
            size="large"
            aria-label={language.t("context.title")}
            aria-expanded={opened()}
            aria-controls={cardID}
            disabled={sideOpened()}
            icon={<Icon name="bullet-list" />}
            onClick={() => (card().status === "open" ? close() : setCard({ status: "open" }))}
          />
        </Tooltip>
        <Show when={opened()}>
          <aside
            id={cardID}
            class="conversation-context-card"
            role="region"
            aria-label={language.t("context.title")}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return
              event.preventDefault()
              event.stopPropagation()
              close()
            }}
          >
            <header class="conversation-context-header">
              <div>
                <small>{language.t("context.title")}</small>
                <strong>
                  <Icon name="folder" />
                  {projectName()}
                </strong>
                <Show when={directory()}>
                  {(path) => (
                    <span class="conversation-context-branch" title={path()}>
                      <Icon name="branch" />
                      {branch() ?? language.t("sidebar.tree.local")}
                    </span>
                  )}
                </Show>
              </div>
              <IconButton
                type="button"
                variant="ghost-muted"
                size="small"
                aria-label={language.t("context.close")}
                icon={<Icon name="close-small" />}
                onClick={close}
              />
            </header>
            <div class="conversation-context-body" data-scrollable>
              <Show when={synced.loading}>
                <p class="conversation-context-notice" role="status">
                  <Loader class="size-3.5" />
                  {language.t("context.loading")}
                </p>
              </Show>
              <Show when={synced.error || (!synced.loading && synced())}>
                <p class="conversation-context-notice" role="status">
                  {language.t("context.partialError")}
                  <button type="button" onClick={() => void syncActions.refetch()}>
                    {language.t("common.retry")}
                  </button>
                </p>
              </Show>
              <section class="conversation-context-changes">
                <button
                  type="button"
                  class="conversation-context-item"
                  onClick={() => command.trigger("review.toggle")}
                >
                  <Icon name="code-lines" />
                  <span>{language.t("context.changes")}</span>
                  <Show when={!diffs.error || !working.error} fallback={<b>-</b>}>
                    <Show when={!diffs.loading && !working.loading} fallback={<Loader class="size-3.5" />}>
                      <b>{changed().length}</b>
                      <span class="conversation-context-add">+{additions()}</span>
                      <span class="conversation-context-delete">−{deletions()}</span>
                    </Show>
                  </Show>
                </button>
                <Show when={diffs.error || working.error}>
                  <p class="conversation-context-notice">
                    {language.t("context.workspaceDiffError")}
                    <button
                      type="button"
                      onClick={() => {
                        void diffActions.refetch()
                        void workingActions.refetch()
                      }}
                    >
                      {language.t("common.retry")}
                    </button>
                  </p>
                </Show>
              </section>
              <ContextSection
                title={language.t("context.agents")}
                count={children().length}
                icon="branch-out"
                empty={language.t("context.noAgents")}
              >
                <For each={children()}>
                  {(child) => (
                    <button
                      type="button"
                      class="conversation-context-item"
                      onClick={() => openSession(params.id, child.id)}
                    >
                      <Show when={child.model} fallback={<Icon name="brain" />}>
                        {(model) => (
                          <ProviderModelIcon
                            model={model()}
                            provider={
                              data.location.provider
                                .list(child.location)
                                ?.find((provider) => provider.id === model().providerID) ?? {
                                id: model().providerID,
                                name: model().providerID,
                              }
                            }
                          />
                        )}
                      </Show>
                      <span>{child.title ?? language.t("session.tab.session")}</span>
                      <small
                        class="conversation-context-agent-state"
                        data-running={data.session.status(child.id) === "running"}
                      >
                        {language.t(
                          data.session.status(child.id) === "running"
                            ? "context.running"
                            : child.outcome === "failed"
                              ? "context.failed"
                              : child.outcome === "succeeded"
                                ? "context.completed"
                                : child.outcome === "interrupted"
                                  ? "context.stopped"
                                  : "context.idle",
                        )}
                      </small>
                    </button>
                  )}
                </For>
              </ContextSection>
              <ContextSection
                title={language.t("context.sources")}
                count={facts().sources.length + facts().files.length}
                icon="globe"
                empty={language.t("context.noSources")}
              >
                <For each={facts().sources}>
                  {(source) => (
                    <button
                      type="button"
                      class="conversation-context-item"
                      title={source.url}
                      onClick={() => open({ key: source.url, href: source.url, name: source.title ?? source.site })}
                    >
                      <Icon name="globe" />
                      <span>
                        {source.title ?? source.site}
                        <small>{source.site}</small>
                      </span>
                      <Icon name="open-file" class="conversation-context-trailing" />
                    </button>
                  )}
                </For>
                <For each={facts().files}>{fileRow}</For>
              </ContextSection>
              <ContextSection
                title={language.t("context.artifacts")}
                count={facts().artifacts.length}
                icon="file-tree"
                empty={language.t("context.noArtifacts")}
              >
                <For each={facts().artifacts}>{fileRow}</For>
              </ContextSection>
              <ContextSection
                title={language.t("context.mcps")}
                count={servers() ? facts().mcps.length : undefined}
                icon="mcp"
                empty={servers() ? language.t("context.noMcps") : language.t("context.catalogUnavailable")}
              >
                <For each={facts().mcps}>
                  {(mcp) => (
                    <button
                      type="button"
                      class="conversation-context-item"
                      onClick={() => {
                        const dir = directory()
                        if (dir) dialog.show(() => <DialogMcp directory={dir} server={mcp.name} />)
                      }}
                    >
                      <Icon name="mcp" />
                      <span>{mcp.name}</span>
                      <small>{language.plural("context.calls", mcp.count)}</small>
                    </button>
                  )}
                </For>
              </ContextSection>
              <ContextSection
                title={language.t("context.skills")}
                count={facts().skills.length}
                icon="post-skill"
                empty={language.t("context.noSkills")}
              >
                <For each={facts().skills}>
                  {(skill) => (
                    <button type="button" class="conversation-context-item" disabled={skill.automatic} onClick={() => openSkill(skill)}>
                      <Icon name="post-skill" />
                      <span>{skill.name}</span>
                      <small>×{skill.count}</small>
                    </button>
                  )}
                </For>
              </ContextSection>
              <section class="conversation-context-extensions" aria-label={language.t("context.extensions")}>
                <h3>{language.t("context.extensions")}</h3>
                <details class="conversation-context-section">
                  <summary>
                    <Icon name="mcp" />
                    <span>{language.t("context.availableMcps")}</span>
                    <b>{servers()?.length ?? "-"}</b>
                    <Icon name="chevron-down" class="conversation-context-chevron" />
                  </summary>
                  <Show
                    when={servers()?.length}
                    fallback={
                      <p class="conversation-context-empty">
                        {servers() ? language.t("context.noConfigured") : language.t("context.catalogUnavailable")}
                      </p>
                    }
                  >
                    <div class="conversation-context-catalog">
                      <For each={servers()}>
                        {(item) => (
                          <button
                            type="button"
                            class="conversation-context-item"
                            onClick={() => {
                              const dir = directory()
                              if (dir) dialog.show(() => <DialogMcp directory={dir} server={item.name} />)
                            }}
                          >
                            <Icon name="mcp" />
                            <span>{item.name}</span>
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                  <button
                    type="button"
                    class="conversation-context-item"
                    onClick={() => void extensionAction("mcp", "setup")}
                  >
                    <Icon name="plus" />
                    <span>{language.t("context.addMcp")}</span>
                  </button>
                  <button
                    type="button"
                    class="conversation-context-item"
                    onClick={() => void extensionAction("mcp", "config")}
                  >
                    <Icon name="settings-gear" />
                    <span>
                      {server.isLocal ? language.t("context.configuration") : language.t("context.copyConfiguration")}
                    </span>
                  </button>
                </details>
                <details class="conversation-context-section">
                  <summary>
                    <Icon name="cube" />
                    <span>{language.t("context.availablePlugins")}</span>
                    <b>{plugins()?.length ?? "-"}</b>
                    <Icon name="chevron-down" class="conversation-context-chevron" />
                  </summary>
                  <Show
                    when={!plugins.error}
                    fallback={
                      <p class="conversation-context-empty">
                        {language.t("context.loadPluginsFailed")}{" "}
                        <button type="button" onClick={() => void pluginActions.refetch()}>
                          {language.t("common.retry")}
                        </button>
                      </p>
                    }
                  >
                    <Show
                      when={plugins()?.length}
                      fallback={
                        <p class="conversation-context-empty">
                          {plugins.loading ? language.t("context.loading") : language.t("context.noConfigured")}
                        </p>
                      }
                    >
                      <div class="conversation-context-catalog">
                        <For each={plugins()}>
                          {(plugin) => (
                            <div class="conversation-context-item">
                              <Icon name="cube" />
                              <span>
                                {plugin.id ??
                                  (plugin.source.type === "package"
                                    ? plugin.source.target
                                    : plugin.source.type === "local"
                                      ? plugin.source.path
                                      : plugin.source.type)}
                              </span>
                              <small>{plugin.state.status}</small>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Show>
                  <button
                    type="button"
                    class="conversation-context-item"
                    onClick={() => void extensionAction("plugins", "setup")}
                  >
                    <Icon name="plus" />
                    <span>{language.t("context.addPlugin")}</span>
                  </button>
                  <button
                    type="button"
                    class="conversation-context-item"
                    onClick={() => void extensionAction("plugins", "config")}
                  >
                    <Icon name="settings-gear" />
                    <span>
                      {server.isLocal ? language.t("context.configuration") : language.t("context.copyConfiguration")}
                    </span>
                  </button>
                </details>
                <details class="conversation-context-section">
                  <summary>
                    <Icon name="post-skill" />
                    <span>{language.t("context.availableSkills")}</span>
                    <b>{catalog()?.length ?? "-"}</b>
                    <Icon name="chevron-down" class="conversation-context-chevron" />
                  </summary>
                  <label class="conversation-context-search">
                    <span class="sr-only">{language.t("context.searchSkills")}</span>
                    <input
                      value={skillQuery()}
                      onInput={(event) => setSkillQuery(event.currentTarget.value)}
                      placeholder={language.t("context.searchSkills")}
                    />
                  </label>
                  <Show
                    when={filteredSkills().length}
                    fallback={
                      <p class="conversation-context-empty">
                        {catalog() ? language.t("context.noMatches") : language.t("context.loading")}
                      </p>
                    }
                  >
                    <div class="conversation-context-catalog">
                      <For each={filteredSkills()}>
                        {(skill) => (
                          <button
                            type="button"
                            class="conversation-context-item"
                            title={skill.description ?? skill.name}
                            onClick={() => openSkill({ id: skill.id, name: skill.name, text: skill.content, count: 1 })}
                          >
                            <Icon name="post-skill" />
                            <span>{skill.name}</span>
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                  <button
                    type="button"
                    class="conversation-context-item"
                    onClick={() => void extensionAction("skills", "setup")}
                  >
                    <Icon name="plus" />
                    <span>{language.t("context.addSkill")}</span>
                  </button>
                  <button
                    type="button"
                    class="conversation-context-item"
                    onClick={() => void extensionAction("skills", "config")}
                  >
                    <Icon name="settings-gear" />
                    <span>
                      {server.isLocal ? language.t("context.configuration") : language.t("context.copyConfiguration")}
                    </span>
                  </button>
                </details>
              </section>
              <Show when={data.session.message.more(params.id)}>
                <p class="conversation-context-notice">
                  {language.t("context.loadedHistory")}
                  <button
                    type="button"
                    disabled={data.session.message.loading(params.id)}
                    onClick={() =>
                      void data.session.message
                        .loadMore(params.id, { all: true })
                        .catch(() => showToast({ variant: "error", title: language.t("context.partialError") }))
                    }
                  >
                    {language.t("context.loadAll")}
                  </button>
                </p>
              </Show>
            </div>
          </aside>
        </Show>
      </div>
    </Show>
  )
}

function ContextSection(props: ParentProps<{ title: string; count: number | undefined; icon: string; empty: string }>) {
  return (
    <details class="conversation-context-section" open={(props.count ?? 0) > 0}>
      <summary>
        <Icon name={props.icon} />
        <span>{props.title}</span>
        <b>{props.count ?? "—"}</b>
        <Icon name="chevron-down" class="conversation-context-chevron" />
      </summary>
      <Show when={(props.count ?? 0) > 0} fallback={<p class="conversation-context-empty">{props.empty}</p>}>
        {props.children}
      </Show>
    </details>
  )
}
