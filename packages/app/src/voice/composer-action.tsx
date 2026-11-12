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
import { DictationTransport, type DictationBackend } from "./dictation-transport"
import type { DictationFailure } from "./dictation-transport-machine"

type SpeechResult = { isFinal: boolean; readonly [index: number]: { transcript: string } }
type SpeechRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null
  onspeechend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export function ComposerDictation(props: {
  controller: ComposerEditorModel
  backend?: DictationBackend
  disabled?: boolean
}) {
  const language = useLanguage()
  const [state, setState] = createSignal<DictationState>({ status: "idle" })
  let recognition: SpeechRecognition | undefined
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
    const backend = transport
    transport = undefined
    backend?.close()
    const current = recognition
    recognition = undefined
    if (!current) return
    current.onstart = null
    current.onresult = null
    current.onspeechend = null
    current.onerror = null
    current.onend = null
    current.abort()
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

  const stop = () => {
    if (state().status === "starting") {
      dispatch({ type: "cancel" })
      release()
      return
    }
    if (state().status !== "listening") return
    if (transport) return transport.stop()
    dispatch({ type: "stop" })
    try {
      recognition?.stop()
    } catch {
      fail("failed")
    }
  }

  const startBackend = () => {
    const backend = props.backend
    if (!backend) return fail("unsupported")
    release()
    dispatch({ type: "cancel" })
    dispatch({ type: "start" })
    transport = new DictationTransport({
      ...backend,
      language: language.intl(),
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

  const start = () => {
    if (active()) return stop()
    if (props.backend?.platform.platform === "desktop") return startBackend()
    const browser = window as Window & {
      SpeechRecognition?: new () => SpeechRecognition
      webkitSpeechRecognition?: new () => SpeechRecognition
    }
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!Recognition) return startBackend()
    try {
      const current = new Recognition()
      recognition = current
      current.lang = language.intl()
      current.continuous = true
      current.interimResults = true
      current.onstart = () => dispatch({ type: "started" })
      current.onresult = (event) => {
        const results = Array.from(event.results)
        dispatch({
          type: "results",
          final: results.flatMap((result) => (result.isFinal ? [result[0].transcript] : [])),
          interim: results.flatMap((result) => (!result.isFinal ? [result[0].transcript] : [])).join(" "),
        })
      }
      current.onspeechend = stop
      current.onerror = (event) => {
        if (
          event.error === "network" ||
          event.error === "service-not-allowed" ||
          event.error === "language-not-supported"
        )
          return startBackend()
        fail(
          event.error === "not-allowed" || event.error === "audio-capture"
            ? "microphone"
            : event.error === "no-speech"
              ? "empty"
              : "failed",
        )
      }
      current.onend = () => {
        const previous = state()
        dispatch({ type: "end" })
        release()
        if ((previous.status === "listening" || previous.status === "stopping") && previous.final.length === 0)
          fail("empty")
      }
      dispatch({ type: "start" })
      current.start()
    } catch {
      fail("failed")
    }
  }

  onCleanup(() => {
    dispatch({ type: "disposed" })
    release()
  })

  return (
    <div data-slot="composer-dictation" class="flex items-center gap-2">
      <Show when={active()}>
        <output role="status" class="max-w-52 truncate text-12-regular text-v2-text-text-muted">
          {language.t(state().status === "starting" ? "prompt.dictation.starting" : "prompt.dictation.listening")}
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
