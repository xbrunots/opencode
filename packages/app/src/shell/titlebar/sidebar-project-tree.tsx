import { createMemo, For, onMount, Show } from "solid-js"
import type { SessionInfo } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import { getFilename } from "@opencode/util/path"
import { useLanguage } from "@/runtime/i18n/language"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection } from "@/runtime/server/registry"
import { createProjectSessionActions } from "@/shell/tabs/project-sessions"
import { useTabs } from "@/shell/tabs/tabs"
import { pathKey } from "@/workspaces/path-key"
import { useLayout } from "@/shell/state/layout"
import { ProjectSessionRow } from "./project-session-row"

export function SidebarProjectTree(props: {
  server: ServerConnection.Any
  directory: string
  directories: string[]
  sessions: SessionInfo[]
}) {
  const language = useLanguage()
  const global = useGlobal()
  const tabs = useTabs()
  const layout = useLayout()
  const actions = createProjectSessionActions()
  const key = () => ServerConnection.key(props.server)
  const groups = createMemo(() => [
    ...new Set([props.directory, ...props.directories, ...props.sessions.map((session) => session.location.directory)]),
  ])
  const active = (session: SessionInfo) => {
    const route = layout.route()
    return route.type === "session" && route.server === key() && route.sessionId === session.id
  }
  const open = (session: SessionInfo) => {
    layout.home.setSelection({ server: key(), directory: session.location.directory })
    actions.openProjectSession(props.server, props.directory, session, { preview: true })
  }
  const row = (session: SessionInfo, depth = 0) => (
    <ProjectSessionRow
      server={key()}
      session={session}
      openTab={!!tabs.sessionTab(key(), session.id)}
      active={active(session)}
      depth={depth}
      onOpen={() => open(session)}
    />
  )

  return (
    <div
      data-slot="sidebar-project-tree"
      class="ms-4 flex min-w-0 flex-col border-s border-v2-border-border-muted ps-1"
    >
      <For each={groups()}>
        {(directory) => {
          const sessions = createMemo(() =>
            props.sessions
              .filter((session) => !session.time.archived && session.location.directory === directory)
              .toSorted(
                (left, right) =>
                  Number(right.metadata?.opencodexPinned === true) - Number(left.metadata?.opencodexPinned === true),
              ),
          )
          onMount(() => {
            const context = global.serverCtx(key())
            if (context && !context.data.location.vcs.info({ directory }))
              void context.data.location.vcs.sync({ directory }).catch(() => undefined)
          })
          const branch = () => global.serverCtx(key())?.data.location.vcs.info({ directory })?.branch.current
          const roots = () =>
            sessions().filter(
              (session) => !session.parentID || !sessions().some((parent) => parent.id === session.parentID),
            )
          return (
            <details open class="min-w-0">
              <summary
                class="flex h-7 min-w-0 cursor-pointer list-none items-center gap-2 ps-0 pe-2 text-12-regular text-v2-text-text-muted"
                onClick={() => layout.home.setSelection({ server: key(), directory })}
              >
                <Icon name="chevron-down" size="small" />
                <span data-slot="sidebar-branch-icon" class="flex shrink-0">
                  <Icon name="branch" size="small" />
                </span>
                <span class="min-w-0 truncate" title={directory}>
                  {branch() ||
                    (pathKey(directory) === pathKey(props.directory)
                      ? language.t("sidebar.tree.local")
                      : getFilename(directory))}
                </span>
              </summary>
              <div class="ms-3 min-w-0 border-s border-v2-border-border-muted ps-1">
                <Show when={sessions().length === 0}>
                  <div class="px-2 py-1 text-12-regular text-v2-text-text-faint">
                    {language.t("sidebar.organize.empty")}
                  </div>
                </Show>
                <For each={roots()}>
                  {(session) => (
                    <>
                      {row(session)}
                      <Show when={sessions().filter((child) => child.parentID === session.id).length > 0}>
                        <details class="ms-4 min-w-0">
                          <summary class="flex h-6 cursor-pointer items-center gap-2 px-2 text-12-regular text-v2-text-text-faint">
                            <Icon name="branch" size="small" />
                            {language.t("sidebar.tree.subagents")}
                          </summary>
                          <For each={sessions().filter((child) => child.parentID === session.id)}>
                            {(child) => row(child, 1)}
                          </For>
                        </details>
                      </Show>
                    </>
                  )}
                </For>
              </div>
            </details>
          )
        }}
      </For>
    </div>
  )
}
