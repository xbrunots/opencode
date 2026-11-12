"use client"

import { cn } from "cn"
import { ArrowUpIcon, PlusIcon, SquareIcon } from "lucide-react"
import type { FormEvent } from "react"
import { useState } from "react"

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"

import { CHATGPT_DEFAULT_EFFORT, CHATGPT_DEFAULT_MODEL } from "../constants/chatgpt-models"
import type { ChatgptComposerProps, ChatgptEffortId, ChatgptModelId } from "../types/chatgpt"
import { ChatgptModelSelector } from "./chatgpt-model-selector"

const sendClassName =
  "bg-chatgpt-send text-chatgpt-send-fg hover:bg-chatgpt-send-hover hover:text-chatgpt-send-fg focus-visible:ring-chatgpt-focus/35 dark:hover:bg-chatgpt-send-hover size-9 rounded-full border-0 transition-colors duration-150 focus-visible:ring-2 motion-reduce:transition-none"

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
  ...props
}: ChatgptComposerProps) => {
  const [uncontrolledValue, setUncontrolledValue] = useState("")
  const value = valueProp ?? uncontrolledValue
  const setValue = (next: string) => {
    if (valueProp === undefined) setUncontrolledValue(next)
    onValueChange?.(next)
  }
  const [uncontrolledModel, setUncontrolledModel] = useState(defaultModel)
  const [uncontrolledEffort, setUncontrolledEffort] = useState(defaultEffort)
  const model = modelProp ?? uncontrolledModel
  const effort = effortProp ?? uncontrolledEffort
  const canSend = value.trim().length > 0 || !!attachments

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
      onSubmit={handleSubmit}
      {...props}
    >
      <InputGroup
        className={cn(
          "bg-chatgpt-composer border-chatgpt-composer-border has-disabled:bg-chatgpt-composer dark:has-disabled:bg-chatgpt-composer text-chatgpt-fg shadow-chatgpt-composer has-[[data-slot=input-group-control]:focus-visible]:border-chatgpt-composer-border dark:bg-chatgpt-composer h-auto min-h-13 gap-1.5 rounded-[1.75rem] px-2 py-2 has-disabled:opacity-100 has-[[data-slot=input-group-control]:focus-visible]:ring-0",
        )}
      >
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
        />
        <InputGroupAddon align="block-end" className="gap-1.5 px-0 pb-0 has-[>button]:mr-0">
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
          ) : (
            <InputGroupButton
              key="send"
              aria-label="Enviar mensagem"
              className={cn(
                sendClassName,
                "disabled:bg-chatgpt-send/35 disabled:text-chatgpt-send-fg disabled:opacity-100",
              )}
              disabled={!canSend}
              size="icon-sm"
              type="submit"
            >
              <ArrowUpIcon className="size-5" strokeWidth={2} />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
