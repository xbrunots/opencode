import { Schema } from "effect"
import { Popover } from "@kobalte/core/popover"
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  onCleanup,
  untrack,
  type Accessor,
  type JSX,
} from "solid-js"
import { Key } from "@solid-primitives/keyed"
import { createStore, produce } from "solid-js/store"
import { useQuery } from "@tanstack/solid-query"
import { DragDropProvider, PointerSensor, useDroppable } from "@dnd-kit/solid"
import { isSortable, useSortable } from "@dnd-kit/solid/sortable"
import { Accessibility, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers"

import { Icon } from "@opencode/ui/icon"
import { uuid } from "@opencode/util/uuid"
import { IconButton } from "@opencode/ui/icon-button"
import { ProjectIcon } from "@/shell/layout/project-icon"
import { Menu } from "@opencode/ui/menu"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import { TextInput } from "@opencode/ui/text-input"
import { ScrollView } from "@opencode/ui/scroll-view"
import { displayName } from "@opencode/ui/project-avatar"
import { homeSessionsQuery } from "@/home/sessions/queries"
import { createProjectActions } from "@/home/projects/actions"
import { ProjectMenuItems } from "@/home/projects/menu"
import { buildHomeSessionRecords } from "@/home/sessions/records"
import { arrayMove } from "@/runtime/array-move"
import { useLanguage } from "@/runtime/i18n/language"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal, useServerCtx } from "@/runtime/server/runtime"
import type { Project } from "@/runtime/server/types"
import { useLayout } from "@/shell/state/layout"

import { useTabs, type Tab } from "@/shell/tabs/tabs"
import { pathKey } from "@/workspaces/path-key"
import "./tab-nav.css"
import { SidebarProjectTree } from "./sidebar-project-tree"
import { useDirectoryPicker } from "@/workspaces/selection/picker"
import { addProjects } from "@/home/projects/add"
import { errorMessage, homeProjectDirectories } from "@/shell/layout/helpers"
import { showToast } from "@/shell/notifications/toast"
import { isSidebarSessionActivity, mergeSidebarSessions } from "./sidebar-sessions"

const SidebarState = Persistence.struct({
  projectsCollapsed: Schema.Boolean,
  expanded: Persistence.record(Schema.Boolean),
  order: Persistence.record(Schema.mutable(Schema.Array(Schema.String))),
  groups: Persistence.record(Persistence.record(Schema.String)),
  archived: Persistence.record(Persistence.record(Schema.Boolean)),
  members: Persistence.record(Schema.String),
})

/** Tracks session activity on every server, and keeps a preview tab once its session does something. */
export function createSidebarActivityListener() {
  const tabs = useTabs()

  const global = useGlobal()

  // Keep a preview tab once its session shows activity. Ordering comes from the shared data layer, so this listener
  // only decides when a preview has become worth keeping.
  createEffect(() => {
    global.servers.list().forEach((conn) => {
      const server = ServerConnection.key(conn)
      const ctx = global.serverCtx(server)

      if (!ctx) return
      onCleanup(
        ctx.data.listen(({ details }) => {
          if (!isSidebarSessionActivity(details)) return
          const sessionID = details.data.sessionID
          const preview = tabs.preview()

          if (
            preview?.server === server &&
            (preview.sessionId === sessionID || preview.sessionId === ctx.data.session.root(sessionID))
          )
            tabs.keepPreview()
        }),
      )
    })
  })
}

export function SidebarOrganized(props: {
  currentTab: Tab | undefined
  children: (highlightActive: Accessor<boolean>, onNavigate: () => void) => JSX.Element
}) {
  const language = useLanguage()

  const tabs = useTabs()
  const servers = useServers()
  const global = useGlobal()
  const layout = useLayout()
  const pickDirectory = useDirectoryPicker()
  const [groupAction, setGroupAction] = createStore<{ open: boolean; view: "menu" | "create"; name: string }>({
    open: false,
    view: "menu",
    name: "",
  })
  const activeServer = () =>
    servers.visible.find(
      (connection) => ServerConnection.key(connection) === (props.currentTab?.server ?? layout.home.selection().server),
    ) ?? servers.visible[0]
  const addProject = () => {
    const server = activeServer()
    if (!server) return
    const context = global.serverCtx(ServerConnection.key(server))
    if (!context) return
    pickDirectory({
      server,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: (value) => {
        void addProjects(context, homeProjectDirectories(value)).catch((error) =>
          showToast({
            title: language.t("common.requestFailed"),
            description: errorMessage(error, language.t("common.requestFailed")),
          }),
        )
      },
    })
  }

  createSidebarActivityListener()

  const [local, setLocal] = createStore<{
    projectSession: { server: ServerConnection.Key; sessionId: string } | undefined
    thumbTrack: HTMLDivElement | undefined
    hoverTarget: HTMLDivElement | undefined
  }>({ projectSession: undefined, thumbTrack: undefined, hoverTarget: undefined })

  const selectTabs = () => setLocal("projectSession", undefined)

  const projectSelected = () => {
    const tab = props.currentTab

    return (
      tab?.type === "session" &&
      tab.server === local.projectSession?.server &&
      tab.sessionId === local.projectSession?.sessionId
    )
  }

  const [state, setState, , ready] = persisted(Persist.global("sidebar.organize"), SidebarState, {
    projectsCollapsed: false,
    expanded: {},
    order: {},
    groups: {},
    archived: {},
    members: {},
  })

  const isOpenTab = (server: ServerConnection.Key, sessionId: string) =>
    tabs.store.some((tab) => tab.type === "session" && tab.server === server && tab.sessionId === sessionId)

  return (
    <div
      ref={(element) => setLocal("hoverTarget", element)}
      class="relative flex min-h-0 flex-1 flex-col [app-region:no-drag]"
    >
      <div
        ref={(element) => setLocal("thumbTrack", element)}
        class="pointer-events-none absolute inset-y-0 z-10 w-3"
        style={{
          "inset-inline-end": "calc(-1 * (var(--sidebar-inset-end, 3px) + var(--shell-inline-inset, 8px)))",
        }}
      />
      <ScrollView class="min-h-0 flex-1" thumbContainer={local.thumbTrack} thumbHoverTarget={local.hoverTarget}>
        <div class="flex flex-col gap-3">
          <section class="flex shrink-0 flex-col gap-2">
            <div class="flex min-w-0 items-center gap-1">
              <button
                type="button"
                class="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-[6px] px-2 text-start text-[13px] leading-4 font-medium text-v2-text-text-muted hover:text-v2-text-text-base focus-visible:outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
                aria-expanded={!state.projectsCollapsed}
                onClick={() => setState("projectsCollapsed", (value) => !value)}
              >
                <span class="min-w-0 truncate">{language.t("home.projects")}</span>
                <Icon
                  name="fill-triangle-down"
                  size="small"
                  class="shrink-0 text-v2-icon-icon-muted transition-transform"
                  classList={{ "-rotate-90 rtl:rotate-90": state.projectsCollapsed }}
                />
              </button>
              <Popover
                open={groupAction.open}
                onOpenChange={(open) => setGroupAction({ open, view: "menu", name: "" })}
                placement="bottom-end"
                gutter={6}
              >
                <Popover.Trigger
                  as={IconButton}
                  icon={<Icon name="plus" />}
                  variant="ghost-muted"
                  size="small"
                  aria-label={language.t("sidebar.project.add")}
                />
                <Popover.Portal>
                  <Popover.Content
                    aria-label={language.t("home.projects")}
                    dir={language.direction()}
                    class="z-50 w-[min(288px,calc(100vw-24px))] rounded-[10px] bg-v2-background-bg-base p-3 shadow-[var(--v2-elevation-floating)] outline-none"
                  >
                    <Show
                      when={groupAction.view === "create"}
                      fallback={
                        <div class="flex flex-col gap-1">
                          <button
                            type="button"
                            class="rounded-md px-2 py-2 text-start text-12-regular text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover"
                            onClick={() => setGroupAction({ view: "create", name: "" })}
                          >
                            {language.t("sidebar.group.create")}
                          </button>
                          <button
                            type="button"
                            class="rounded-md px-2 py-2 text-start text-12-regular text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover"
                            onClick={() => {
                              setGroupAction("open", false)
                              addProject()
                            }}
                          >
                            {language.t("sidebar.project.create")}
                          </button>
                          <Show
                            when={
                              activeServer() &&
                              Object.entries(state.archived[ServerConnection.key(activeServer()!)] ?? {}).some(
                                ([, archived]) => archived,
                              )
                            }
                          >
                            <div class="mt-1 border-t border-v2-border-border-muted pt-2 text-12-regular text-v2-text-text-muted">
                              {language.t("sidebar.group.archived")}
                            </div>
                            <For
                              each={Object.entries(state.archived[ServerConnection.key(activeServer()!)] ?? {}).filter(
                                ([, archived]) => archived,
                              )}
                            >
                              {([id]) => (
                                <button
                                  type="button"
                                  class="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-start text-12-regular text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
                                  onClick={() => {
                                    const conn = activeServer()
                                    if (conn) setState("archived", ServerConnection.key(conn), id, false)
                                    setGroupAction("open", false)
                                  }}
                                >
                                  <span class="truncate">
                                    {state.groups[ServerConnection.key(activeServer()!)]?.[id]}
                                  </span>
                                  <span class="text-v2-text-text-muted">{language.t("sidebar.group.restore")}</span>
                                </button>
                              )}
                            </For>
                          </Show>
                        </div>
                      }
                    >
                      <form
                        class="flex flex-col gap-3 p-1"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const conn = activeServer()
                          const name = groupAction.name.trim()
                          if (!conn || !name) return
                          setState("groups", ServerConnection.key(conn), (groups) => ({ ...groups, [uuid()]: name }))
                          setGroupAction({ open: false, view: "menu", name: "" })
                          setState("projectsCollapsed", false)
                        }}
                      >
                        <div class="text-14-medium text-v2-text-text-base">{language.t("sidebar.group.create")}</div>
                        <label class="flex flex-col gap-1.5 text-12-regular text-v2-text-text-muted">
                          {language.t("sidebar.group.name")}
                          <TextInput
                            autofocus
                            class="w-full"
                            value={groupAction.name}
                            onInput={(event) => setGroupAction("name", event.currentTarget.value)}
                          />
                        </label>
                        <div class="flex justify-end gap-2 pt-1">
                          <Button
                            type="button"
                            variant="neutral"
                            onClick={() => setGroupAction({ open: false, view: "menu", name: "" })}
                          >
                            {language.t("common.cancel")}
                          </Button>
                          <Button type="submit" variant="contrast" disabled={!groupAction.name.trim()}>
                            {language.t("common.save")}
                          </Button>
                        </div>
                      </form>
                    </Show>
                  </Popover.Content>
                </Popover.Portal>
              </Popover>
            </div>
            <Show when={!state.projectsCollapsed}>
              <div class="flex min-w-0 flex-col gap-1">
                <ProjectList
                  currentTab={props.currentTab}
                  isOpenTab={isOpenTab}
                  highlightActive={projectSelected()}
                  onSelect={(session) => setLocal("projectSession", session)}
                  state={state}
                  ready={ready()}
                  onExpand={(key) => setState("expanded", key, (value) => value === false)}
                  onReorder={(server, ids) => setState("order", server, ids)}
                  onCreateGroup={() => setGroupAction({ open: true, view: "create", name: "" })}
                  onMoveGroup={(server, id, group) => setState("members", `${server}:${id}`, group)}
                  onRenameGroup={(server, id, name) => setState("groups", server, id, name)}
                  onArchiveGroup={(server, id) => setState("archived", server, (groups) => ({ ...groups, [id]: true }))}
                  onDeleteGroup={(server, id) => {
                    const context = global.serverCtx(server)
                    const members = Object.entries(state.members).flatMap(([key, group]) =>
                      key.startsWith(`${server}:`) && group === id ? [key.slice(server.length + 1)] : [],
                    )
                    context?.projects
                      .used()
                      .filter((project) => members.includes(project.id))
                      .forEach((project) => context.projects.hide(project))
                    setState("order", server, (order) => (order ?? []).filter((project) => !members.includes(project)))
                    setState(
                      "groups",
                      server,
                      produce((groups) => {
                        delete groups[id]
                      }),
                    )
                    setState(
                      "members",
                      produce((groups) => {
                        members.forEach((project) => delete groups[`${server}:${project}`])
                      }),
                    )
                    if (state.archived[server])
                      setState(
                        "archived",
                        server,
                        produce((groups) => {
                          delete groups[id]
                        }),
                      )
                  }}
                />
              </div>
            </Show>
          </section>
          <div class="flex shrink-0 flex-col gap-3" classList={{ hidden: tabs.store.length === 0 }}>
            <Show when={!state.projectsCollapsed}>
              <div role="separator" class="mx-2 h-px shrink-0 bg-v2-border-border-muted" />
            </Show>
            {/* The empty strip still owns tab shortcuts; only its visual section is hidden. */}
            {props.children(() => !projectSelected(), selectTabs)}
          </div>
        </div>
      </ScrollView>
    </div>
  )
}

function ProjectList(props: {
  currentTab: Tab | undefined
  isOpenTab: (server: ServerConnection.Key, sessionId: string) => boolean
  highlightActive: boolean
  onSelect: (session: { server: ServerConnection.Key; sessionId: string }) => void
  state: typeof SidebarState.Type
  ready: boolean
  onExpand: (key: string) => void
  onReorder: (server: string, ids: string[]) => void
  onCreateGroup: () => void
  onMoveGroup: (server: string, id: string, group: string) => void
  onRenameGroup: (server: string, id: string, name: string) => void
  onArchiveGroup: (server: string, id: string) => void
  onDeleteGroup: (server: ServerConnection.Key, id: string) => void
}) {
  const servers = useServers()

  const layout = useLayout()

  const projectActions = createProjectActions()
  const dialog = useDialog()
  const language = useLanguage()
  const global = useGlobal()
  const rename = (project: Project) => {
    const key = server()
    const context = key && global.serverCtx(key)
    if (!context) return
    void dialog.show(() => (
      <ProjectNameDialog
        title={language.t("sidebar.project.rename")}
        initial={displayName(project)}
        save={async (name) => {
          if (!project.id || project.id === "global") return context.sync.project.meta(project.worktree, { name })
          const updated = await context.sdk.api.project.update({ projectID: project.id, name })
          context.sync.project.update(updated)
        }}
      />
    ))
  }

  const connection = createMemo(
    () =>
      servers.visible.find(
        (conn) => ServerConnection.key(conn) === (props.currentTab?.server ?? layout.home.selection().server),
      ) ?? servers.visible[0],
  )

  const ctx = useServerCtx(connection)

  const server = () => {
    const conn = connection()

    return conn ? ServerConnection.key(conn) : undefined
  }

  const projects = createMemo(() => {
    const list = ctx()?.projects.used() ?? []

    const order = props.state.order[server() ?? ""] ?? []

    return [
      ...order.flatMap((id) => list.find((project) => project.id === id) ?? []),
      ...list.filter((project) => !order.includes(project.id)),
    ]
  })

  const visible = () => projects()

  // Freeze the initial order, then append newly used projects instead of following last activity.
  createEffect(() => {
    const key = server()

    if (!props.ready || !servers.hydrated() || !key || !ctx()?.sync.project.ready()) return
    const ids = projects().map((project) => project.id)

    const saved = props.state.order[key] ?? []

    if (ids.length === saved.length && ids.every((id, index) => id === saved[index])) return
    untrack(() => props.onReorder(key, ids))
  })

  const sessions = useQuery(() => ({
    ...homeSessionsQuery(connection(), ctx()),
    enabled: ctx()?.sdk.connection.status() === "connected",
  }))

  const records = createMemo(() => {
    const current = ctx()

    if (!current) return []

    return buildHomeSessionRecords({
      sessions: () =>
        current.data.session.apply(
          mergeSidebarSessions(sessions.isPending ? [] : (sessions.data?.() ?? []), current.data.session.known()),
        ),
      projects,
      projectDirectories: () => undefined,
      resolveProject: current.projects.forSession,
    })
  })

  const grouped = createMemo(() => Map.groupBy(records(), (record) => pathKey(record.project.worktree)))

  const renderProjects = (items: () => Project[], conn: ServerConnection.Any) => (
    <Key each={items()} by={(project) => `${ServerConnection.key(conn)}:${project.id}`}>
      {(project) => {
        const key = () => `${server()}:${project().id}`
        const projectSessions = () => grouped().get(pathKey(project().worktree)) ?? []
        return (
          <ProjectRow
            project={project()}
            server={conn}
            actions={projectActions}
            index={projects().findIndex((item) => item.id === project().id)}
            expanded={props.state.expanded[key()] !== false}
            onRename={() => rename(project())}
            onCreateGroup={props.onCreateGroup}
            groups={Object.fromEntries(
              Object.entries(props.state.groups[server() ?? ""] ?? {}).filter(
                ([id]) => !props.state.archived[server() ?? ""]?.[id],
              ),
            )}
            group={props.state.members[key()]}
            onMoveGroup={(group) => props.onMoveGroup(ServerConnection.key(conn), project().id, group)}
            onToggle={() => {
              layout.home.setSelection({ server: ServerConnection.key(conn), directory: project().worktree })
              props.onExpand(key())
            }}
          >
            <SidebarProjectTree
              server={conn}
              directory={project().worktree}
              directories={project().worktrees.map((worktree) => worktree.directory)}
              sessions={projectSessions().map((record) => record.session)}
            />
          </ProjectRow>
        )
      }}
    </Key>
  )

  return (
    <>
      <Show when={connection()}>
        {(conn) => (
          <DragDropProvider
            sensors={[
              PointerSensor.configure({
                activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
                preventActivation: (event) =>
                  event.target instanceof Element && !!event.target.closest("[data-project-action]"),
              }),
            ]}
            modifiers={[RestrictToVerticalAxis]}
            plugins={(defaults) => [
              ...defaults.filter((plugin) => plugin !== Accessibility),
              Feedback.configure({ dropAnimation: null }),
            ]}
            onDragEnd={(event) => {
              const source = event.operation.source

              if (event.canceled || !isSortable(source)) return
              const target = event.operation.target?.id.toString()
              const key = ServerConnection.key(conn())
              const group = target?.startsWith("group:")
                ? target.slice(6)
                : target
                  ? props.state.members[`${key}:${target}`]
                  : undefined
              if (group && props.state.groups[key]?.[group]) {
                props.onMoveGroup(key, source.id.toString(), group)
                return
              }
              if (
                target &&
                projects().some((project) => project.id === target) &&
                props.state.members[`${key}:${source.id}`]
              ) {
                props.onMoveGroup(key, source.id.toString(), "")
              }
              if (source.initialIndex === source.index) return
              props.onReorder(
                ServerConnection.key(conn()),
                arrayMove(
                  projects().map((project) => project.id),
                  source.initialIndex,
                  source.index,
                ),
              )
            }}
          >
            <For
              each={Object.keys(props.state.groups[server() ?? ""] ?? {}).filter(
                (id) => !props.state.archived[server() ?? ""]?.[id],
              )}
            >
              {(id) => (
                <ProjectGroup
                  id={id}
                  name={props.state.groups[server() ?? ""]?.[id] ?? ""}
                  onRename={(name) => props.onRenameGroup(ServerConnection.key(conn()), id, name)}
                  onArchive={() => props.onArchiveGroup(ServerConnection.key(conn()), id)}
                  onDelete={() => props.onDeleteGroup(ServerConnection.key(conn()), id)}
                >
                  {renderProjects(
                    () => visible().filter((project) => props.state.members[`${server()}:${project.id}`] === id),
                    conn(),
                  )}
                </ProjectGroup>
              )}
            </For>
            {renderProjects(
              () =>
                visible().filter(
                  (project) =>
                    !props.state.members[`${server()}:${project.id}`] ||
                    !props.state.groups[server() ?? ""]?.[props.state.members[`${server()}:${project.id}`]!],
                ),
              conn(),
            )}
          </DragDropProvider>
        )}
      </Show>
    </>
  )
}

function ProjectRow(props: {
  project: Project
  server: ServerConnection.Any
  actions: ReturnType<typeof createProjectActions>
  index: number
  expanded: boolean
  onToggle: () => void
  onRename: () => void
  onCreateGroup: () => void
  groups: Record<string, string>
  group?: string
  onMoveGroup: (group: string) => void
  children: JSX.Element
}) {
  const language = useLanguage()

  const [menu, setMenu] = createStore({ open: false })

  const sortable = useSortable({
    get id() {
      return props.project.id
    },
    get index() {
      return props.index
    },
  })

  return (
    <div data-slot="sidebar-project-row" data-project-id={props.project.id} class="relative shrink-0">
      <div
        ref={sortable.ref}
        class="group/project relative flex h-7 min-w-0 shrink-0 items-center rounded-[6px] pe-1 hover:bg-v2-overlay-simple-overlay-hover has-[:focus-visible]:bg-v2-overlay-simple-overlay-hover"
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu("open", true)
        }}
        onKeyDown={(event) => {
          if (event.key !== "ContextMenu" && (event.key !== "F10" || !event.shiftKey)) return
          event.preventDefault()
          setMenu("open", true)
        }}
      >
        <button
          type="button"
          class="flex h-full min-w-0 flex-1 shrink-0 cursor-default items-center gap-2 rounded-[6px] bg-transparent px-2 text-start text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted [font-weight:440] transition-colors duration-[120ms] ease-in-out group-hover/project:text-v2-text-text-base focus-visible:text-v2-text-text-base focus-visible:outline-none"
          aria-expanded={props.expanded}
          onClick={props.onToggle}
        >
          <span class="flex size-4 shrink-0 items-center justify-center">
            <ProjectIcon project={props.project} open={props.expanded} />
          </span>
          <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" dir="auto">
            {displayName(props.project)}
          </span>
        </button>
        <span
          data-project-action
          data-menu={menu.open}
          class="hover-reveal flex shrink-0 items-center gap-1 group-hover/project:opacity-100 focus-within:opacity-100 data-[menu=true]:opacity-100"
        >
          <Menu
            gutter={6}
            modal={false}
            placement="bottom-end"
            open={menu.open}
            onOpenChange={(open) => setMenu("open", open)}
          >
            <Menu.Trigger
              as={IconButton}
              variant="ghost-muted"
              size="small"
              icon={<Icon name="outline-dots" />}
              aria-label={language.t("common.moreOptions")}
            />
            <Menu.Portal>
              <Menu.Content>
                <Menu.Item onSelect={props.onRename}>{language.t("sidebar.project.rename")}</Menu.Item>
                <Menu.Item onSelect={props.onCreateGroup}>{language.t("sidebar.group.create")}</Menu.Item>
                <Show when={Object.keys(props.groups).length > 0}>
                  <Menu.Sub placement="right-start" gutter={4}>
                    <Menu.SubTrigger>{language.t("sidebar.group.move")}</Menu.SubTrigger>
                    <Menu.Portal>
                      <Menu.SubContent>
                        <For each={Object.entries(props.groups)}>
                          {([id, name]) => <Menu.Item onSelect={() => props.onMoveGroup(id)}>{name}</Menu.Item>}
                        </For>
                        <Show when={props.group}>
                          <Menu.Item onSelect={() => props.onMoveGroup("")}>
                            {language.t("sidebar.group.ungroup")}
                          </Menu.Item>
                        </Show>
                      </Menu.SubContent>
                    </Menu.Portal>
                  </Menu.Sub>
                </Show>
                <Menu.Separator />
                <ProjectMenuItems
                  server={props.server}
                  project={props.project}
                  unread={props.actions.hasUnread(props.server, props.project)}
                  canImportSession={props.actions.canImportSession}
                  importingSession={props.actions.importingSession()}
                  canRevealProject={props.actions.canReveal}
                  onOpenProjectNewSession={props.actions.openNewSession}
                  onImportSession={props.actions.importSession}
                  onEditProject={props.actions.edit}
                  onRevealProject={props.actions.reveal}
                  onClearNotifications={props.actions.clearNotifications}
                  onHideProject={props.actions.hide}
                />
              </Menu.Content>
            </Menu.Portal>
          </Menu>
          <IconButton
            icon={<Icon name="edit" />}
            variant="ghost-muted"
            size="small"
            aria-label={language.t("command.session.new")}
            onClick={() => props.actions.openNewSession(props.server, props.project.worktree)}
          />
        </span>
      </div>
      <Show when={props.expanded}>
        <div data-project-action class="flex flex-col gap-[3px] pb-1">
          {props.children}
        </div>
      </Show>
    </div>
  )
}

function ProjectGroup(props: {
  id: string
  name: string
  children: JSX.Element
  onRename: (name: string) => void
  onArchive: () => void
  onDelete: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const [group, setGroup] = createStore({ menu: false, rename: false, name: "" })
  const drop = useDroppable({
    collisionPriority: 4,
    get id() {
      return `group:${props.id}`
    },
  })
  return (
    <details
      open
      ref={drop.ref}
      class="min-w-0"
      classList={{ "bg-v2-overlay-simple-overlay-hover": drop.isDropTarget() }}
    >
      <summary
        class="flex h-7 cursor-pointer items-center px-2 text-12-regular text-v2-text-text-muted"
        onContextMenu={(event) => {
          event.preventDefault()
          setGroup("menu", true)
        }}
        onKeyDown={(event) => {
          if (event.key !== "ContextMenu" && (event.key !== "F10" || !event.shiftKey)) return
          event.preventDefault()
          setGroup("menu", true)
        }}
      >
        <Popover
          open={group.rename}
          onOpenChange={(open) => setGroup("rename", open)}
          placement="bottom-start"
          gutter={6}
        >
          <Popover.Anchor class="flex min-w-0 flex-1 items-center gap-2">
            <Icon name="chevron-down" size="small" />
            <span class="min-w-0 flex-1 truncate">{props.name}</span>
            <Menu
              open={group.menu}
              onOpenChange={(open) => setGroup("menu", open)}
              placement="bottom-end"
              gutter={6}
              modal={false}
            >
              <Menu.Trigger
                as={IconButton}
                icon={<Icon name="outline-dots" />}
                variant="ghost-muted"
                size="small"
                aria-label={language.t("common.moreOptions")}
                onClick={(event) => event.stopPropagation()}
              />
              <Menu.Portal>
                <Menu.Content>
                  <Menu.Item onSelect={() => setGroup({ rename: true, name: props.name })}>
                    {language.t("common.rename")}
                  </Menu.Item>
                  <Menu.Item
                    onSelect={() =>
                      void dialog.show(() => (
                        <GroupConfirmDialog name={props.name} action="archive" confirm={props.onArchive} />
                      ))
                    }
                  >
                    {language.t("common.archive")}
                  </Menu.Item>
                  <Menu.Item
                    onSelect={() =>
                      void dialog.show(() => (
                        <GroupConfirmDialog name={props.name} action="delete" confirm={props.onDelete} />
                      ))
                    }
                  >
                    {language.t("common.delete")}
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu>
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content
              aria-label={language.t("sidebar.group.rename")}
              dir={language.direction()}
              class="z-50 w-[min(288px,calc(100vw-24px))] rounded-[10px] bg-v2-background-bg-base p-4 shadow-[var(--v2-elevation-floating)] outline-none"
            >
              <form
                class="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  const name = group.name.trim()
                  if (!name) return
                  props.onRename(name)
                  setGroup("rename", false)
                }}
              >
                <div class="text-14-medium text-v2-text-text-base">{language.t("sidebar.group.rename")}</div>
                <label class="flex flex-col gap-1.5 text-12-regular text-v2-text-text-muted">
                  {language.t("sidebar.group.name")}
                  <TextInput
                    autofocus
                    class="w-full"
                    value={group.name}
                    onInput={(event) => setGroup("name", event.currentTarget.value)}
                  />
                </label>
                <div class="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="neutral" onClick={() => setGroup("rename", false)}>
                    {language.t("common.cancel")}
                  </Button>
                  <Button type="submit" variant="contrast" disabled={!group.name.trim()}>
                    {language.t("common.save")}
                  </Button>
                </div>
              </form>
            </Popover.Content>
          </Popover.Portal>
        </Popover>
      </summary>
      <div class="ms-3">{props.children}</div>
    </details>
  )
}

function GroupConfirmDialog(props: { name: string; action: "archive" | "delete"; confirm: () => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>
          {language.t(props.action === "archive" ? "sidebar.group.archive" : "sidebar.group.delete")}
        </DialogTitle>
      </DialogHeader>
      <DialogBody>
        <p class="text-14-regular text-v2-text-text-muted">
          {language.t(props.action === "archive" ? "sidebar.group.archive.confirm" : "sidebar.group.delete.confirm", {
            name: props.name,
          })}
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="neutral" autofocus onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button
          variant={props.action === "delete" ? "danger" : "contrast"}
          onClick={() => {
            dialog.close()
            props.confirm()
          }}
        >
          {language.t(props.action === "archive" ? "common.archive" : "common.delete")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function ProjectNameDialog(props: { title: string; initial: string; save: (name: string) => void | Promise<unknown> }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [name, setName] = createSignal(props.initial)
  const [busy, setBusy] = createSignal(false)
  const submit = () => {
    const value = name().trim()
    if (!value || busy()) return
    setBusy(true)
    void Promise.try(() => props.save(value)).then(
      () => dialog.close(),
      (error) => {
        setBusy(false)
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(error, language.t("common.requestFailed")),
        })
      },
    )
  }
  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <TextInput
          autofocus
          value={name()}
          aria-label={props.title}
          onInput={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit()
          }}
        />
      </DialogBody>
      <DialogFooter>
        <Button variant="neutral" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button variant="contrast" disabled={!name().trim() || busy()} onClick={submit}>
          {language.t("common.save")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
