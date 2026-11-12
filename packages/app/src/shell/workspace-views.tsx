import { useCurrentRoute } from "@/shell/state/layout"
import { createContext, createMemo, useContext, type ParentProps } from "solid-js"
import { Schema } from "effect"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { Persistence } from "@/runtime/persistence/schema"
import { tabKey, useTabs } from "@/shell/tabs/tabs"

export type WorkspaceViewMode = "focus" | "grid" | "islands"
const WorkspaceViewsContext = createContext<ReturnType<typeof createWorkspaceViews>>()

function createWorkspaceViews() {
  const tabs = useTabs()
  const route = useCurrentRoute()
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
  return {
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
