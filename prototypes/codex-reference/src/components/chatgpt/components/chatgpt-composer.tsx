"use client"

import { cn } from "cn"
import { ArrowUpIcon, LoaderCircleIcon, MicIcon, PlusIcon, SquareIcon } from "lucide-react"
import type { FormEvent } from "react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"

import { CHATGPT_DEFAULT_EFFORT, CHATGPT_DEFAULT_MODEL } from "../constants/chatgpt-models"
import type { ChatgptComposerProps, ChatgptEffortId, ChatgptModelId } from "../types/chatgpt"
import { ChatgptModelSelector } from "./chatgpt-model-selector"

const sendClassName =
  "workspace-composer-action focus-visible:ring-chatgpt-focus/35 size-9 shrink-0 rounded-full transition-colors duration-150 focus-visible:ring-2 motion-reduce:transition-none"

type VoiceResult = { isFinal: boolean; readonly [index: number]: { transcript: string } }
type VoiceResultsEvent = { results: ArrayLike<VoiceResult> }
type VoiceErrorEvent = { error: string }
type VoiceRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: VoiceResultsEvent) => void) | null
  onspeechend: (() => void) | null
  onerror: ((event: VoiceErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type VoiceConstructor = new () => VoiceRecognition
type VoiceRun = { recognition: VoiceRecognition; prefix: string; final: string[]; cancelled: boolean }

const detachVoice = (recognition: VoiceRecognition) => {
  recognition.onstart = null
  recognition.onresult = null
  recognition.onspeechend = null
  recognition.onerror = null
  recognition.onend = null
}

export const ChatgptComposer = ({
  busy = false,
  className,
  defaultEffort = CHATGPT_DEFAULT_EFFORT,
  defaultModel = CHATGPT_DEFAULT_MODEL,
  effort: effortProp,
  efforts,
  model: modelProp,
  models,
  onEffortChange,
  onModelChange,
  onSend,
  onStop,
  placeholder = "Ask anything",
  value: valueProp,
  onValueChange,
  onAttach,
  modelSelector,
  attachments,
  compactLogo,
  ...props
}: ChatgptComposerProps) => {
  const [uncontrolledValue, setUncontrolledValue] = useState("")
  const [focused, setFocused] = useState(false)
  const [voiceState, setVoiceState] = useState<"idle" | "starting" | "listening" | "ending">("idle")
  const voiceRun = useRef<VoiceRun | null>(null)
  const live = useRef({ onSend, onValueChange, busy, controlled: valueProp !== undefined })
  live.current = { onSend, onValueChange, busy, controlled: valueProp !== undefined }
  const value = valueProp ?? uncontrolledValue
  const setValue = (next: string) => {
    if (!live.current.controlled) setUncontrolledValue(next)
    live.current.onValueChange?.(next)
  }
  const [uncontrolledModel, setUncontrolledModel] = useState(defaultModel)
  const [uncontrolledEffort, setUncontrolledEffort] = useState(defaultEffort)
  const model = modelProp ?? uncontrolledModel
  const effort = effortProp ?? uncontrolledEffort
  const canSend = value.trim().length > 0 || !!attachments
  const hasText = value.length > 0
  const voiceActive = voiceState !== "idle"
  const expanded = focused || hasText || !!attachments || voiceActive || busy

  const finishVoice = (run: VoiceRun, send: boolean) => {
    if (voiceRun.current !== run) return
    voiceRun.current = null
    detachVoice(run.recognition)
    setVoiceState("idle")
    const transcript = run.final.filter(Boolean).join(" ").trim()
    const text = [run.prefix, transcript].filter(Boolean).join(" ")
    setValue(text)
    if (!send || run.cancelled || live.current.busy) return
    if (!transcript) {
      toast.info("Nenhuma fala identificada", { description: "Toque no microfone para tentar novamente." })
      return
    }
    if (live.current.onSend) {
      live.current.onSend(text)
      setValue("")
    }
  }

  const cancelVoice = () => {
    const run = voiceRun.current
    if (!run) return
    run.cancelled = true
    finishVoice(run, false)
    run.recognition.abort()
  }

  const stopVoice = () => {
    const run = voiceRun.current
    if (!run || voiceState === "ending") return
    if (voiceState === "starting") return cancelVoice()
    setVoiceState("ending")
    run.recognition.onspeechend = null
    try {
      run.recognition.stop()
    } catch {
      cancelVoice()
      toast.error("Não foi possível concluir o ditado", { description: "O texto reconhecido foi mantido no rascunho." })
    }
  }

  const startVoice = () => {
    if (busy || voiceRun.current) return
    const browser = window as Window & {
      SpeechRecognition?: VoiceConstructor
      webkitSpeechRecognition?: VoiceConstructor
    }
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!Recognition) {
      toast.error("Ditado indisponível neste navegador", {
        description: "Use um navegador com suporte ao reconhecimento de voz ou digite sua mensagem.",
      })
      return
    }
    const recognition = new Recognition()
    const run: VoiceRun = { recognition, prefix: value.trim(), final: [], cancelled: false }
    voiceRun.current = run
    recognition.lang = "pt-BR"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.onstart = () => {
      if (voiceRun.current === run) setVoiceState("listening")
    }
    recognition.onresult = (event) => {
      if (voiceRun.current !== run || run.cancelled) return
      const results = Array.from(event.results)
      results.forEach((result, index) => {
        if (result.isFinal) run.final[index] = result[0].transcript.trim()
      })
      const interim = results
        .filter((result) => !result.isFinal)
        .map((result) => result[0].transcript.trim())
        .join(" ")
      setValue([run.prefix, run.final.filter(Boolean).join(" "), interim].filter(Boolean).join(" "))
    }
    recognition.onspeechend = () => {
      if (voiceRun.current !== run) return
      setVoiceState("ending")
      recognition.onspeechend = null
      recognition.stop()
    }
    recognition.onerror = (event) => {
      if (voiceRun.current !== run) return
      run.cancelled = true
      finishVoice(run, false)
      recognition.abort()
      const description =
        (
          {
            "not-allowed": "Permita o acesso ao microfone nas configurações deste site e tente novamente.",
            "service-not-allowed": "O serviço de reconhecimento de voz está bloqueado neste navegador.",
            "audio-capture": "Conecte ou habilite um microfone e tente novamente.",
            network: "O serviço de transcrição não respondeu. Confira sua conexão e tente novamente.",
            "no-speech": "Não foi identificada fala. Toque no microfone para tentar novamente.",
            aborted: "A captura foi interrompida. O texto reconhecido permanece no rascunho.",
          } as Record<string, string>
        )[event.error] || "Não foi possível reconhecer a fala. Tente novamente ou digite sua mensagem."
      toast.error("Ditado interrompido", { description })
    }
    recognition.onend = () => finishVoice(run, true)
    setVoiceState("starting")
    try {
      recognition.start()
    } catch {
      cancelVoice()
      toast.error("Não foi possível iniciar o ditado", {
        description: "Confira o acesso ao microfone e tente novamente.",
      })
    }
  }

  useEffect(
    () => () => {
      const run = voiceRun.current
      if (!run) return
      run.cancelled = true
      voiceRun.current = null
      detachVoice(run.recognition)
      run.recognition.abort()
    },
    [],
  )

  useEffect(() => {
    if (busy && voiceRun.current) cancelVoice()
  }, [busy])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = value.trim()
    if ((!text && !attachments) || busy) {
      return
    }
    onSend?.(text)
    if (onSend) {
      setValue("")
    }
  }

  const handleModelChange = (next: ChatgptModelId) => {
    if (modelProp === undefined) {
      setUncontrolledModel(next)
    }
    onModelChange?.(next)
  }

  const handleEffortChange = (next: ChatgptEffortId) => {
    if (effortProp === undefined) {
      setUncontrolledEffort(next)
    }
    onEffortChange?.(next)
  }

  return (
    <form
      className={cn("font-chatgpt w-full", className)}
      data-slot="chatgpt-composer"
      data-expanded={expanded}
      data-voice-state={voiceState}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape" && voiceRun.current) {
          event.preventDefault()
          cancelVoice()
        }
      }}
      onSubmit={handleSubmit}
      {...props}
    >
      <InputGroup
        className={cn(
          "bg-chatgpt-composer border-chatgpt-composer-border has-disabled:bg-chatgpt-composer dark:has-disabled:bg-chatgpt-composer text-chatgpt-fg shadow-chatgpt-composer has-[[data-slot=input-group-control]:focus-visible]:border-chatgpt-composer-border dark:bg-chatgpt-composer h-auto min-h-13 gap-1.5 rounded-[1.75rem] px-2 py-2 has-disabled:opacity-100 has-[[data-slot=input-group-control]:focus-visible]:ring-0",
        )}
      >
        {compactLogo && (
          <InputGroupAddon align="inline-start" data-slot="chatgpt-composer-logo" className="p-0">
            {compactLogo}
          </InputGroupAddon>
        )}
        {attachments && (
          <InputGroupAddon align="block-start" className="px-2 pt-2">
            {attachments}
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          aria-label="Mensagem"
          className="placeholder:text-chatgpt-muted min-h-18 max-h-44 px-3! pt-2.5 pb-1 text-base md:text-base"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (canSend && !busy) event.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder={placeholder}
          value={value}
          readOnly={voiceActive}
        />
        <InputGroupAddon align="block-end" className="gap-1.5 px-0 pb-0 has-[>button]:mr-0">
          <div data-slot="chatgpt-composer-controls" className="flex min-w-0 flex-1 items-center gap-1.5">
            <InputGroupButton
              aria-label="Anexar arquivo"
              onClick={onAttach}
              className="text-chatgpt-fg/80 hover:bg-chatgpt-hover hover:text-chatgpt-fg size-9 shrink-0 rounded-full border-0"
              size="icon-xs"
            >
              <PlusIcon className="size-5" strokeWidth={1.5} />
            </InputGroupButton>
            {modelSelector ?? (
              <ChatgptModelSelector
                effort={effort}
                efforts={efforts}
                model={model}
                models={models}
                onEffortChange={handleEffortChange}
                onModelChange={handleModelChange}
              />
            )}
            <span className="flex-1" />
          </div>
          {busy ? (
            <InputGroupButton
              key="stop"
              aria-label="Interromper resposta"
              disabled={false}
              className={sendClassName}
              onClick={onStop}
              size="icon-sm"
            >
              <SquareIcon className="size-3.5 fill-current" strokeWidth={2} />
            </InputGroupButton>
          ) : voiceActive ? (
            <InputGroupButton
              key="voice-stop"
              aria-label={
                voiceState === "starting"
                  ? "Cancelar ditado"
                  : voiceState === "ending"
                    ? "Finalizando ditado"
                    : "Finalizar ditado e enviar"
              }
              aria-pressed="true"
              disabled={voiceState === "ending"}
              className={cn(sendClassName, "workspace-composer-listening")}
              onClick={stopVoice}
              size="icon-sm"
            >
              {voiceState === "starting" || voiceState === "ending" ? (
                <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <SquareIcon className="size-3.5 fill-current" />
              )}
            </InputGroupButton>
          ) : hasText || attachments ? (
            <InputGroupButton
              key="send"
              aria-label="Enviar mensagem"
              className={sendClassName}
              disabled={!canSend}
              size="icon-sm"
              type="submit"
            >
              <ArrowUpIcon className="size-5" strokeWidth={2} />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              key="voice"
              aria-label="Ditar e enviar mensagem"
              aria-pressed="false"
              className={sendClassName}
              onClick={startVoice}
              size="icon-sm"
            >
              <MicIcon className="size-4.5" strokeWidth={1.75} />
            </InputGroupButton>
          )}
        </InputGroupAddon>
        {voiceActive && (
          <span role="status" aria-live="polite" data-slot="chatgpt-composer-voice-status">
            {voiceState === "starting"
              ? "Aguardando o microfone…"
              : voiceState === "ending"
                ? "Finalizando a transcrição…"
                : "Ouvindo. A mensagem será enviada ao terminar."}
          </span>
        )}
      </InputGroup>
    </form>
  )
}
