import { createSignal, onCleanup, Show } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Loader } from "@opencode/ui/loader"
import { Tooltip } from "@opencode/ui/tooltip"
import { useLanguage } from "@/runtime/i18n/language"
import { showToast } from "@/shell/notifications/toast"
import type { ComposerEditorModel } from "@/composer/editor/interaction"
import { promptLength } from "@/composer/prompt-parts"
import { transitionDictation, type DictationEvent, type DictationState } from "./dictation-machine"
import { DictationTransport, type DictationEnvironment } from "./dictation-transport"
import type { DictationFailure } from "./dictation-transport-machine"

export function ComposerDictation(props: {
  controller: ComposerEditorModel
  environment?: DictationEnvironment
  disabled?: boolean
}) {
  const language = useLanguage()
  const [state, setState] = createSignal<DictationState>({ status: "idle" })
  let transport: DictationTransport | undefined
  const active = () => state().status === "starting" || state().status === "listening" || state().status === "stopping"

  const dispatch = (event: DictationEvent) => {
    const next = transitionDictation(state(), event)
    setState(next.state)
    if (!next.transcript) return
    const prefix = props.controller.value()
    const text = `${prefix && !/\s$/.test(prefix) ? " " : ""}${next.transcript}`
    const start = promptLength(props.controller.parts())
    props.controller.onInput(
      prefix + text,
      [...props.controller.parts(), { type: "text", content: text, start, end: start + text.length }],
      start + text.length,
    )
    if (props.controller.canSubmit()) props.controller.submit()
    props.controller.restoreFocus()
  }

  const release = () => {
    const current = transport
    transport = undefined
    current?.close()
  }

  const fail = (reason: DictationFailure) => {
    dispatch({ type: "failed" })
    release()
    showToast({
      variant: "error",
      title: language.t("prompt.dictation.title"),
      description: language.t(`prompt.dictation.${reason}`),
    })
  }

  const start = () => {
    if (state().status === "starting") {
      dispatch({ type: "cancel" })
      release()
      return
    }
    if (active()) return transport?.stop()
    dispatch({ type: "start" })
    transport = new DictationTransport({
      platform: props.environment?.platform ?? {},
      started: () => dispatch({ type: "started" }),
      stopped: () => dispatch({ type: "stop" }),
      complete: (text) => {
        dispatch({ type: "results", final: [text], interim: "" })
        dispatch({ type: "end" })
        release()
      },
      failed: fail,
    })
    transport.start()
  }

  onCleanup(() => {
    dispatch({ type: "disposed" })
    release()
  })
  return (
    <div data-slot="composer-dictation" class="flex items-center gap-2">
      <Show when={active()}>
        <output role="status" class="max-w-52 truncate text-12-regular text-v2-text-text-muted">
          {language.t(
            state().status === "starting"
              ? "prompt.dictation.starting"
              : state().status === "stopping"
                ? "prompt.dictation.finishing"
                : "prompt.dictation.listening",
          )}
        </output>
      </Show>
      <Tooltip placement="top" value={language.t(active() ? "prompt.dictation.stop" : "prompt.dictation.start")}>
        <IconButton
          data-action="composer-voice"
          type="button"
          variant="submit"
          class="size-8 rounded-full"
          aria-label={language.t(active() ? "prompt.dictation.stop" : "prompt.dictation.start")}
          aria-pressed={active()}
          disabled={props.disabled || state().status === "stopping"}
          icon={
            state().status === "starting" || state().status === "stopping" ? (
              <Loader class="size-4" />
            ) : active() ? (
              <Icon name="stop" />
            ) : (
              <VoiceMicrophoneIcon />
            )
          }
          onClick={start}
        />
      </Tooltip>
    </div>
  )
}

export function VoiceMicrophoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="2.75" width="6" height="12" rx="3" stroke="currentColor" stroke-width="1.65" />
      <path
        d="M5.75 10.75V12a6.25 6.25 0 0 0 12.5 0v-1.25M12 18.25v3M9 21.25h6"
        stroke="currentColor"
        stroke-width="1.65"
        stroke-linecap="round"
      />
    </svg>
  )
}
