import { render } from "solid-js/web"
import { PluginContext } from "@opencode/plugin/gui/host"
import type { MountedSession } from "@opencode/plugin/gui"
import { ChatHtmlPreview } from "../../gui-plugins/src/file/chat-preview"
import { createEmbeds } from "../../app/src/runtime/plugin/embeds"
import "../../gui-plugins/src/file/artifact-view.css"

/** The desktop bridge is the only substitute; scrolling and the preview component are real. */
export function mountChatPreview(height = 220) {
  const host = document.createElement("div")
  Object.assign(host.style, { position: "fixed", top: "0", left: "0", zIndex: "9999" })
  host.dataset.testid = "native-chat-fixture"
  host.dataset.opened = "0"
  host.dataset.closed = "0"
  document.body.append(host)
  let sequence = 0
  const ctx = {
    app: { platform: "desktop" },
    appearance: { mode: () => "dark" },
    t: (key: string) => key,
    main: () => ({
      open: async () => { host.dataset.opened = String(++sequence); return { id: `preview-${sequence}` } },
      close: async () => { host.dataset.closed = String(Number(host.dataset.closed) + 1) },
      freeze: async () => undefined,
      inspect: async () => undefined,
      appearance: async () => undefined,
      on: () => () => undefined,
    }),
    embeds: {
      View: (props: { id: string; visible: boolean; class?: string }) => <div class={props.class} data-id={props.id} data-visible={String(props.visible)} />,
      capture: async () => new Uint8Array([255, 216, 255, 217]),
    },
  }
  const session = { id: "ses_fixture", server: { id: "server_fixture" } } as MountedSession
  render(() => (
    <PluginContext.Provider value={ctx as never}>
      <div data-scrollable style={{ height: `${height}px`, overflow: "auto" }}>
        <div style={{ height: "20px" }} />
        <div data-preview-viewer style={{ width: "320px", height: "140px" }}>
          <ChatHtmlPreview session={session} path="fixture.html" fallback={() => { host.dataset.fallback = "true" }} />
        </div>
        <div style={{ height: "600px" }} />
      </div>
    </PluginContext.Provider>
  ), host)
}

/** Runs the real embed placement against a scrollable DOM and records its native bridge layouts. */
export function mountScrollingEmbed() {
  const host = document.createElement("div")
  host.dataset.testid = "scrolling-native-fixture"
  Object.assign(host.style, { position: "fixed", top: "0", left: "0", zIndex: "9999" })
  document.body.append(host)
  const embeds = createEmbeds({
    bridge: {
      embed: (_id: string, layout?: { visible: boolean; bounds: { x: number; y: number; width: number; height: number } }) => {
        host.dataset.layout = JSON.stringify(layout ?? null)
      },
      capture: async () => undefined,
      on: () => () => undefined,
    } as never,
    zoom: () => 1,
    dialog: () => false,
    moving: () => false,
  })
  render(() => (
    <div data-scrollable style={{ height: "300px", width: "400px", overflow: "auto" }}>
      <div style={{ height: "80px" }} />
      <embeds.View id="scroll-fixture" visible={true} class="scrolling-native-fixture" />
      <div style={{ height: "600px" }} />
    </div>
  ), host)
  const style = document.createElement("style")
  style.textContent = ".scrolling-native-fixture { width: 320px; height: 100px; }"
  host.append(style)
}
