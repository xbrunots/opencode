import { useLanguage } from "@/runtime/i18n/language"
import {
  transitionWorkspaceResize,
  type WorkspaceResizeState,
  type WorkspaceResizeEvent,
} from "@/shell/workspace-resize-machine"
import { SessionTargetProvider } from "@/session/target"
import { useWorkspaceViews } from "@/shell/workspace-views"
import { tabKey, useTabs } from "@/shell/tabs/tabs"
import { IconButton } from "@opencode/ui/icon-button"
import { Icon } from "@opencode/ui/icon"
import "@/shell/workspace-views.css"
import { Route, useParams } from "@solidjs/router"
import { createMemo, createSignal, For, lazy, onCleanup, onMount, Show, Suspense, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
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
  const [geometry, setGeometry] = createStore({ height: 600 })
  const single = () => (
    <SessionRouteFrame>
      <Suspense fallback={<SessionPanelFrame raised />}>
        <TargetServerRoute>
          <TargetSessionRouteContent />
        </TargetServerRoute>
      </Suspense>
    </SessionRouteFrame>
  )
  return (
    <Show when={views.mode() !== "focus" && views.sessions().length > 0} fallback={single()}>
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
        <For each={views.sessions()}>
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
              focused,
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
                onPointerDown={() => views.focus(key)}
                onFocusIn={() => views.focus(key)}
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
            <Shell>{props.children}</Shell>
          </PluginAttachment>
        </SettingsSurfaceProvider>
      </LayoutProvider>
    </Show>
  )
}
