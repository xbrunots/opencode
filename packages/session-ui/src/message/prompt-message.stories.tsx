import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { SessionMessageUser } from "@opencode/client/promise"
import type { SessionUserActions } from "../actions"
import { CurrentUserMessageDisplay } from "./message-content"
import { CurrentSessionProviders } from "../storybook/current-session-story"
import { CURRENT_SESSION_ID, STORY_MODEL, STORY_TIME } from "../storybook/current-session-fixtures"
import { MarkdownProvider } from "../context/markdown"

export default {
  title: "OpenCode/Conversation/Prompt message",
  id: "current-prompt-message",
  parameters: { layout: "fullscreen" },
}

export const Pending = {
  render: () => {
    const statuses = ["delivered", "starting", "steering", "stranded", "queued", "sending"] as const

    const [state, setState] = createStore<{
      status: (typeof statuses)[number]
      voice: boolean
      text: boolean
      grouped: boolean
      fails: boolean
      failures: number
    }>({
      status: "steering",
      voice: false,
      text: true,
      grouped: false,
      fails: false,
      failures: 0,
    })

    // A failing host rejects, like a server error, and leaves the message as it was.
    const attempt = async (apply: () => void) => {
      if (!state.fails) return apply()
      setState("failures", (count) => count + 1)
      throw new Error("Request failed")
    }

    const message = createMemo<SessionMessageUser>(() => ({
      id: "msg_pending_prompt_story",
      type: "user",
      text: state.text ? "Keep the prompt styling consistent with the rest of the timeline." : "",
      time: { created: STORY_TIME },
      files: state.text
        ? []
        : [{ name: "notes.json", mime: "application/json", data: "e30=", source: { type: "inline" } }],
    }))

    const document = createMemo(() => ({
      sessionID: CURRENT_SESSION_ID,
      messages: [message()],
      status: { type: "idle" as const },
      diffs: [],
    }))

    const actions = {
      revert: () => attempt(() => {}),
      fork: () => attempt(() => {}),
      pending: {
        status: () => (state.status === "delivered" ? undefined : state.status),
        queue: () => attempt(() => setState("status", "queued")),
        remove: () => attempt(() => setState("status", "delivered")),
      },
    } satisfies SessionUserActions

    return (
      <section class="mx-auto flex w-full max-w-[840px] flex-col gap-8 p-6">
        <div class="flex flex-wrap items-center gap-4">
          <label>
            Delivery state{" "}
            <select
              aria-label="Delivery state"
              value={state.status}
              onChange={(event) => {
                const status = statuses.find((status) => status === event.currentTarget.value)

                if (status) setState("status", status)
              }}
            >
              <For each={statuses}>
                {(status) => <option value={status}>{status[0].toUpperCase() + status.slice(1)}</option>}
              </For>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={state.voice}
              onChange={(event) => setState("voice", event.currentTarget.checked)}
            />{" "}
            Voice message
          </label>
          <label>
            <input
              type="checkbox"
              checked={state.text}
              onChange={(event) => setState("text", event.currentTarget.checked)}
            />{" "}
            Prompt text
          </label>
          <label>
            <input
              type="checkbox"
              checked={state.grouped}
              onChange={(event) => setState("grouped", event.currentTarget.checked)}
            />{" "}
            Grouped prompts
          </label>
          <label>
            <input
              type="checkbox"
              checked={state.fails}
              onChange={(event) => setState("fails", event.currentTarget.checked)}
            />{" "}
            Actions fail
          </label>
          <output aria-label="Failed actions">{state.failures}</output>
        </div>
        <CurrentSessionProviders document={document()}>
          <Show when={state.grouped && state.text}>
            <CurrentUserMessageDisplay
              sessionID={CURRENT_SESSION_ID}
              message={{ ...message(), id: "msg_pending_prompt_above" }}
              text="Keep the earlier prompt in the same run."
              agent="build"
              model={STORY_MODEL}
              actions={actions}
              run={{ above: false, below: true }}
            />
          </Show>
          <CurrentUserMessageDisplay
            sessionID={CURRENT_SESSION_ID}
            message={message()}
            text={message().text}
            agent="build"
            model={STORY_MODEL}
            voice={state.voice}
            actions={actions}
            run={{ above: state.grouped && state.text, below: false }}
          />
        </CurrentSessionProviders>
      </section>
    )
  },
}

export const PreviewReferences = {
  render: () => {
    const text = "[Preview: foto-bruno.jpg; x: 17.3%, y: 10.0%] Remova o fundo. Confira effect.html e missing.png."
    const message: SessionMessageUser = {
      id: "msg_preview_reference_story",
      type: "user",
      text,
      time: { created: STORY_TIME },
      files: [{ name: "capture.png", mime: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", source: { type: "inline" } }],
    }
    const document = { sessionID: CURRENT_SESSION_ID, messages: [message], status: { type: "idle" as const }, diffs: [] }
    return (
      <CurrentSessionProviders document={document}>
        <MarkdownProvider
          previewSession={CURRENT_SESSION_ID}
          readImage={async (path) => path === "foto-bruno.jpg" ? new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="30" cy="30" r="20" fill="red"/></svg>'], { type: "image/svg+xml" }) : undefined}
          readPreview={async (path) => path === "effect.html" ? new Blob(["<h1>Artifact preview</h1>"], { type: "text/html" }) : undefined}
        >
          <CurrentUserMessageDisplay sessionID={CURRENT_SESSION_ID} message={message} text={text} agent="build" model={STORY_MODEL} />
        </MarkdownProvider>
      </CurrentSessionProviders>
    )
  },
}
