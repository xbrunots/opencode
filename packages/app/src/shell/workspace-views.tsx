import { useCurrentRoute } from "@/shell/state/layout"
import { createContext, createEffect, createMemo, createSignal, useContext, type ParentProps } from "solid-js"
import { Schema } from "effect"
import type { ServerConnection } from "@/runtime/server/registry"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { Persistence } from "@/runtime/persistence/schema"
import { tabKey, useTabs } from "@/shell/tabs/tabs"

export type WorkspaceViewMode = "focus" | "grid" | "islands"
const WorkspaceViewsContext = createContext<ReturnType<typeof createWorkspaceViews>>()

function createWorkspaceViews() {
  const tabs = useTabs()
  const route = useCurrentRoute()
  const [floating, setFloating] = createSignal<{ server: ServerConnection.Key; sessionID: string }>()
  const [floatingFocused, setFloatingFocused] = createSignal(false)
  const [sideChats, setSideChats, , sideChatsReady] = persisted(Persist.window("workspace.side-chats"), Persistence.record(Schema.String), {})
  const [extensionRoots, setExtensionRoots, , extensionRootsReady] = persisted(
    Persist.window("workspace.extension-roots"),
    Persistence.record(Persistence.array(Schema.String)),
    {},
  )
  const [state, setState] = persisted(
    Persist.window("workspace.views"),
    Persistence.struct({ mode: Schema.Literals(["focus", "grid", "islands"]), minimum: Schema.Finite }),
    { mode: "focus", minimum: 400 },
  )
  const sessions = createMemo(() => tabs.store.filter((tab) => tab.type === "session"))
  const focusedTabKey = createMemo(() => {
    const current = route()
    if (current.type !== "session") return
    const tab = sessions().find(
      (tab) => tab.server === current.server && (tab.routeSessionId ?? tab.sessionId) === current.sessionId,
    )
    return tab ? tabKey(tab) : undefined
  })
  createEffect(() => {
    const current = route()
    const open = floating()
    if (!open || current.type !== "session" || current.server !== open.server || current.sessionId !== open.sessionID)
      return
    setFloatingFocused(false)
    setFloating(undefined)
  })
  return {
    floating,
    sideChatsReady,
    extensionRootsReady,
    extensionRoots: (server: ServerConnection.Key, owner: string) => extensionRoots[`${server}\n${owner}`] ?? [],
    addExtensionRoot: (server: ServerConnection.Key, owner: string, root: string) => {
      const key = `${server}\n${owner}`
      const current = extensionRoots[key] ?? []
      if (!current.includes(root)) setExtensionRoots(key, [...current, root])
    },
    floatingFocused,
    setFloatingFocused,
    openFloating: (server: ServerConnection.Key, sessionID: string, owner?: string) => {
      if (owner) setSideChats(`${server}\n${owner}`, sessionID)
      setFloatingFocused(false)
      setFloating({ server, sessionID })
    },
    reopenFloating: (server: ServerConnection.Key, owner: string) => {
      const sessionID = sideChats[`${server}\n${owner}`]
      if (!sessionID) return false
      const open = floating()
      if (open?.server === server && open.sessionID === sessionID) return true
      if (!tabs.sessionTab(server, sessionID)) tabs.addSessionTab({ server, sessionId: sessionID })
      setFloatingFocused(false)
      setFloating({ server, sessionID })
      return true
    },
    sideChat: (server: ServerConnection.Key, owner: string) => sideChats[`${server}\n${owner}`],
    closeFloating: () => {
      setFloatingFocused(false)
      setFloating(undefined)
    },
    mode: () => state.mode,
    setMode: (mode: WorkspaceViewMode) => setState("mode", mode),
    minimum: () => state.minimum,
    setMinimum: (width: number) => setState("minimum", Math.max(300, Math.min(900, width))),
    sessions,
    focusedTabKey,
    focus(key: string) {
      const tab = sessions().find((tab) => tabKey(tab) === key)
      if (tab && focusedTabKey() !== key) tabs.select(tab)
    },
  }
}

export function WorkspaceViewsProvider(props: ParentProps) {
  const value = createWorkspaceViews()
  return <WorkspaceViewsContext.Provider value={value}>{props.children}</WorkspaceViewsContext.Provider>
}

export function useWorkspaceViews() {
  const context = useContext(WorkspaceViewsContext)
  if (!context) throw new Error("WorkspaceViewsProvider is missing")
  return context
}
