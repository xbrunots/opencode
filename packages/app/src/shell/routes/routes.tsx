import { useLanguage } from "@/runtime/i18n/language"
import {
  transitionWorkspaceResize,
  type WorkspaceResizeState,
  type WorkspaceResizeEvent,
} from "@/shell/workspace-resize-machine"
import { SessionTargetProvider } from "@/session/target"
import { useWorkspaceViews } from "@/shell/workspace-views"
import { transitionFloatingDrag, type FloatingDragState } from "@/shell/floating-drag-machine"
import { tabKey, useTabs } from "@/shell/tabs/tabs"
import { IconButton } from "@opencode/ui/icon-button"
import { Icon } from "@opencode/ui/icon"
import "@/shell/workspace-views.css"
import { Route, useParams } from "@solidjs/router"
import { createMemo, createSignal, For, lazy, onCleanup, onMount, Show, Suspense, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import { Home } from "@/home/route"
import { ServerProvider } from "@/runtime/server/current"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { isServerUnauthorized } from "@/runtime/server/health-machine"
import { SessionPanelFrame, SessionRouteFrame } from "@/session/session-frame"
import { ServerSignedOutPanel } from "@/session/server-unavailable-panel"
import { LayoutProvider } from "@/shell/state/layout"
import { SettingsSurfaceProvider } from "@/settings/surface"
import Shell from "@/shell/shell"
import { requireServerKey } from "./session"
import { PluginAttachment } from "@/runtime/plugin/root"

export const File = lazy(() => import("@opencode/session-ui/file").then((module) => ({ default: module.File })))

const loadSessionRoute = () => Promise.all([import("@/session/route"), File.preload()]).then(([module]) => module)

const DraftRoute = lazy(() => import("@/new-session/route").then((module) => ({ default: module.DraftRoute })))

const SettingsScreen = lazy(() => import("@/settings/shell").then((module) => ({ default: module.SettingsScreen })))

const ConnectServerScreen = lazy(() =>
  import("@/servers/connect/screen").then((module) => ({ default: module.ConnectServerScreen })),
)

// The dev server and Beta only. Both are fixed at build time, so other builds, prod included, drop the import and never
// contain the lab, its stories or knobs. Beta loads it as its own chunk, only when /components opens.
const ComponentsLab =
  import.meta.env.DEV || import.meta.env.VITE_OPENCODE_CHANNEL === "beta"
    ? lazy(() => import("@/components-lab/lab"))
    : undefined

const TargetSessionRouteContent = lazy(() =>
  loadSessionRoute().then((module) => ({ default: module.TargetSessionRouteContent })),
)

export function preloadRoute(url: string) {
  const pathname = url.split(/[?#]/, 1)[0]

  if (pathname === "/new-session") return DraftRoute.preload().then(() => undefined)

  if (pathname === "/settings") return SettingsScreen.preload().then(() => undefined)

  if (/^\/server\/[^/]+\/session\/[^/]+$/.test(pathname))
    return TargetSessionRouteContent.preload().then(() => undefined)

  return Promise.resolve()
}

export function AppRoutes() {
  return (
    <Route component={AppLayout}>
      <Route path="/" component={Home} />
      <Route path="/settings" component={SettingsScreen} />
      <Route path="/server/:serverKey/session/:id" component={WorkspaceSessions} />
      <Route path="/new-session" component={DraftRoute} />
      {ComponentsLab && <Route path="/components" component={ComponentsLab} />}
    </Route>
  )
}

function WorkspaceSessions() {
  const language = useLanguage()
  const views = useWorkspaceViews()
  const tabs = useTabs()
  const params = useParams<{ serverKey: string; id: string }>()
  const visibleSessions = () =>
    views.sessions().filter((tab) => {
      const floating = views.floating()
      return !floating || tab.server !== floating.server || tab.sessionId !== floating.sessionID
    })
  const [geometry, setGeometry] = createStore({ height: 600 })
  let singleRoot: HTMLDivElement | undefined
  const single = () => (
    <div
      ref={singleRoot}
      class="flex size-full min-h-0 min-w-0"
      onFocusIn={() => views.setFloatingFocused(false)}
      onPointerDown={() => views.setFloatingFocused(false)}
    >
      <SessionTargetProvider
        value={{
          get serverKey() {
            return requireServerKey(params.serverKey)
          },
          get sessionID() {
            return params.id
          },
          focused: () => !views.floatingFocused(),
          root: () => singleRoot,
        }}
      >
        <SessionRouteFrame>
          <Suspense fallback={<SessionPanelFrame raised />}>
            <TargetServerRoute>
              <TargetSessionRouteContent />
            </TargetServerRoute>
          </Suspense>
        </SessionRouteFrame>
      </SessionTargetProvider>
    </div>
  )
  return (
    <Show when={views.mode() !== "focus" && visibleSessions().length > 0} fallback={single()}>
      <div
        ref={(element) =>
          onMount(() => {
            const style = getComputedStyle(element)
            setGeometry(
              "height",
              Math.max(360, element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)),
            )
          })
        }
        class="workspace-session-grid"
        data-mode={views.mode()}
        style={{ "--workspace-pane-minimum": `${views.minimum()}px` }}
      >
        <For each={visibleSessions()}>
          {(tab) => {
            const [size, setSize] = createStore({ width: views.minimum() })
            const [resize, setResize] = createSignal<WorkspaceResizeState>({ type: "idle" })
            const dispatch = (event: WorkspaceResizeEvent) => {
              const next = transitionWorkspaceResize(resize(), event)
              setResize(next.state)
              if (event.type !== "finished") return
              if (next.width !== undefined) setSize("width", next.width)
              if (next.height !== undefined) setGeometry("height", next.height)
            }
            onCleanup(() => dispatch({ type: "disposed" }))
            let element: HTMLElement | undefined
            const key = tabKey(tab)
            const focused = () => views.focusedTabKey() === key
            const target = {
              get serverKey() {
                return tab.server
              },
              get sessionID() {
                return tab.routeSessionId ?? tab.sessionId
              },
              focused: () => focused() && !views.floatingFocused(),
              root: () => element,
            }
            return (
              <section
                ref={element}
                class="workspace-session-pane"
                data-focused={focused() || undefined}
                style={{
                  "--workspace-pane-width": `${size.width}px`,
                  "--workspace-pane-height": `${geometry.height}px`,
                }}
                aria-label={tabs.info[key]?.title || tab.sessionId}
                onPointerDown={() => {
                  views.setFloatingFocused(false)
                  views.focus(key)
                }}
                onFocusIn={() => {
                  views.setFloatingFocused(false)
                  views.focus(key)
                }}
              >
                <header class="workspace-session-pane-heading">
                  <span>{tabs.info[key]?.title || tab.sessionId}</span>
                  <IconButton
                    aria-label={language.t("workspace.pane.focus")}
                    icon={<Icon name="arrow-top-right" />}
                    variant="ghost"
                    onClick={() => {
                      views.focus(key)
                      views.setMode("focus")
                    }}
                  />
                  <IconButton
                    aria-label={language.t("workspace.pane.close")}
                    icon={<Icon name="xmark-small" />}
                    variant="ghost"
                    onClick={(event) => {
                      event.stopPropagation()
                      const index = tabs.store.findIndex((item) => tabKey(item) === key)
                      if (index >= 0) tabs.closeTab(index)
                    }}
                  />
                </header>
                <div class="workspace-session-pane-content">
                  <SessionTargetProvider value={target}>
                    <Suspense fallback={<SessionPanelFrame raised />}>
                      <TargetServerRoute serverKey={tab.server}>
                        <TargetSessionRouteContent />
                      </TargetServerRoute>
                    </Suspense>
                  </SessionTargetProvider>
                </div>
                <For each={["width", "height"] as const}>
                  {(axis) => (
                    <div
                      class={`workspace-session-resizer workspace-session-${axis}-resizer`}
                      role="separator"
                      aria-label={language.t("workspace.pane.resize")}
                      aria-orientation={axis === "width" ? "vertical" : "horizontal"}
                      tabIndex={0}
                      data-dragging={(() => {
                        const gesture = resize()
                        return (gesture.type === "dragging" && gesture.axis === axis) || undefined
                      })()}
                      style={{
                        transform: (() => {
                          const gesture = resize()
                          if (gesture.type !== "dragging" || gesture.axis !== axis) return undefined
                          return `${axis === "width" ? "translateX" : "translateY"}(${gesture.current - gesture.origin}px)`
                        })(),
                      }}
                      onPointerDown={(event) => {
                        dispatch({
                          type: "started",
                          pointerID: event.pointerId,
                          x: axis === "width" ? event.clientX : event.clientY,
                          minimum:
                            axis === "width"
                              ? element!.getBoundingClientRect().width
                              : element!.getBoundingClientRect().height,
                          axis,
                        })
                        event.currentTarget.setPointerCapture(event.pointerId)
                      }}
                      onPointerMove={(event) => {
                        dispatch({
                          type: "moved",
                          pointerID: event.pointerId,
                          x: axis === "width" ? event.clientX : event.clientY,
                        })
                      }}
                      onPointerUp={(event) => {
                        dispatch({ type: "finished", pointerID: event.pointerId })
                        if (event.currentTarget.hasPointerCapture(event.pointerId))
                          event.currentTarget.releasePointerCapture(event.pointerId)
                      }}
                      onPointerCancel={(event) => dispatch({ type: "cancelled", pointerID: event.pointerId })}
                      onLostPointerCapture={(event) => dispatch({ type: "cancelled", pointerID: event.pointerId })}
                      onKeyDown={(event) => {
                        const keys = axis === "width" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"]
                        if (!keys.includes(event.key)) return
                        event.preventDefault()
                        const delta = event.key === keys[1] ? 16 : -16
                        if (axis === "width") setSize("width", Math.max(300, Math.min(1600, size.width + delta)))
                        if (axis === "height")
                          setGeometry("height", Math.max(360, Math.min(1600, geometry.height + delta)))
                      }}
                    />
                  )}
                </For>
              </section>
            )
          }}
        </For>
      </div>
    </Show>
  )
}

function TargetServerRoute(props: ParentProps<{ serverKey?: ServerConnection.Key }>) {
  const params = useParams<{ serverKey: string }>()
  const global = useGlobal()

  const connection = createMemo(() =>
    global.servers
      .list()
      .find((item) => ServerConnection.key(item) === (props.serverKey ?? requireServerKey(params.serverKey))),
  )

  return (
    <Show when={connection()} keyed>
      {(connection) => (
        <ServerProvider
          conn={connection}
          signedOut={
            <div class="flex min-h-0 flex-1 px-[var(--shell-inline-inset,8px)] pb-[var(--shell-bottom-inset,8px)] pt-[var(--shell-top-inset,8px)]">
              <SessionPanelFrame raised>
                <ServerSignedOutPanel conn={connection} />
              </SessionPanelFrame>
            </div>
          }
        >
          {props.children}
        </ServerProvider>
      )}
    </Show>
  )
}

function FloatingSession(props: { server: ServerConnection.Key; sessionID: string }) {
  const language = useLanguage()
  const views = useWorkspaceViews()
  const tabs = useTabs()
  const key = tabKey({ type: "session", server: props.server, sessionId: props.sessionID })
  const [position, setPosition] = createStore<{ left?: number; top?: number }>({})
  const [gesture, setGesture] = createSignal<FloatingDragState>({ type: "idle" })
  onCleanup(() => setGesture(transitionFloatingDrag(gesture(), { type: "disposed" })))
  let element: HTMLElement | undefined
  const move = (left: number, top: number) => {
    if (!element) return
    const bounds = element.getBoundingClientRect()
    setPosition({
      left: Math.max(0, Math.min(window.innerWidth - bounds.width, left)),
      top: Math.max(0, Math.min(window.innerHeight - bounds.height, top)),
    })
  }
  const target = {
    serverKey: props.server,
    sessionID: props.sessionID,
    floating: true,
    focused: views.floatingFocused,
    root: () => element,
  }
  onMount(() => {
    const resize = () => {
      if (position.left !== undefined && position.top !== undefined) move(position.left, position.top)
    }
    window.addEventListener("resize", resize)
    onCleanup(() => window.removeEventListener("resize", resize))
  })
  return (
    <Portal>
      <section
        ref={element}
        class="workspace-floating-chat workspace-session-pane"
        data-focused={views.floatingFocused() || undefined}
        aria-label={tabs.info[key]?.title || props.sessionID}
        style={{
          left: position.left === undefined ? undefined : `${position.left}px`,
          top: position.top === undefined ? undefined : `${position.top}px`,
        }}
        onFocusIn={() => views.setFloatingFocused(true)}
      >
        <header class="workspace-session-pane-heading workspace-floating-chat-heading">
          <button
            type="button"
            class="workspace-floating-chat-handle"
            aria-label={language.t("workspace.pane.move")}
            onPointerDown={(event) => {
              if (event.button !== 0 || !element) return
              const bounds = element.getBoundingClientRect()
              setGesture(
                transitionFloatingDrag(gesture(), {
                  type: "started",
                  pointer: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  left: bounds.left,
                  top: bounds.top,
                }),
              )
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              const current = transitionFloatingDrag(gesture(), {
                type: "moved",
                pointer: event.pointerId,
                x: event.clientX,
                y: event.clientY,
              })
              if (current === gesture() || current.type !== "dragging") return
              setGesture(current)
              move(current.left + event.clientX - current.x, current.top + event.clientY - current.y)
            }}
            onPointerUp={(event) => {
              setGesture(transitionFloatingDrag(gesture(), { type: "finished", pointer: event.pointerId }))
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId)
            }}
            onPointerCancel={(event) =>
              setGesture(transitionFloatingDrag(gesture(), { type: "cancelled", pointer: event.pointerId }))
            }
            onLostPointerCapture={(event) =>
              setGesture(transitionFloatingDrag(gesture(), { type: "cancelled", pointer: event.pointerId }))
            }
            onKeyDown={(event) => {
              if (!element) return
              const delta = event.shiftKey ? 64 : 16
              const x = event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0
              const y = event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0
              if (!x && !y) return
              event.preventDefault()
              const bounds = element.getBoundingClientRect()
              move(bounds.left + x, bounds.top + y)
            }}
          >
            <span>{tabs.info[key]?.title || props.sessionID}</span>
          </button>
          <IconButton
            aria-label={language.t("workspace.pane.focus")}
            icon={<Icon name="arrow-top-right" />}
            variant="ghost"
            onClick={() => {
              const tab = tabs.sessionTab(props.server, props.sessionID)
              if (tab) tabs.select(tab)
              views.closeFloating()
            }}
          />
          <IconButton
            aria-label={language.t("workspace.pane.close")}
            icon={<Icon name="xmark-small" />}
            variant="ghost"
            onClick={views.closeFloating}
          />
        </header>
        <div class="workspace-session-pane-content">
          <SessionTargetProvider value={target}>
            <Suspense fallback={<SessionPanelFrame raised />}>
              <TargetServerRoute serverKey={props.server}>
                <TargetSessionRouteContent />
              </TargetServerRoute>
            </Suspense>
          </SessionTargetProvider>
        </div>
      </section>
    </Portal>
  )
}

function AppLayout(props: ParentProps) {
  const servers = useServers()
  const global = useGlobal()

  // A lone server that rejects our credentials (e.g. the web app before pairing) has nothing else to show.
  const signedOut = () => {
    const only = servers.list.length === 1 ? servers.list[0] : undefined

    if (only?.type !== "http") return

    return isServerUnauthorized(global.servers.health[ServerConnection.key(only)]) ? only : undefined
  }

  return (
    <Show when={servers.list.length > 0 && !signedOut()} fallback={<ConnectServerScreen url={signedOut()?.http.url} />}>
      <LayoutProvider>
        <SettingsSurfaceProvider>
          <PluginAttachment>
            <Shell>
              {props.children}
              <Show when={useWorkspaceViews().floating()} keyed>
                {(floating) => <FloatingSession server={floating.server} sessionID={floating.sessionID} />}
              </Show>
            </Shell>
          </PluginAttachment>
        </SettingsSurfaceProvider>
      </LayoutProvider>
    </Show>
  )
}
