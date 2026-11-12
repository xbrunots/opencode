import { cn } from "cn"
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  FileCode2Icon,
  FileIcon,
  FolderGit2Icon,
  LaptopIcon,
  PaperclipIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/button/components/button"
import { ChatgptActions } from "@/components/chatgpt/components/chatgpt-actions"
import { ChatgptActivity } from "@/components/chatgpt/components/chatgpt-activity"
import { ChatgptAppCall } from "@/components/chatgpt/components/chatgpt-app-call"
import { ChatgptComposer } from "@/components/chatgpt/components/chatgpt-composer"
import { ChatgptMessage } from "@/components/chatgpt/components/chatgpt-message"
import { ChatgptReasoning } from "@/components/chatgpt/components/chatgpt-reasoning"
import { ChatgptSourceChip } from "@/components/chatgpt/components/chatgpt-source-chip"
import { ChatgptThinking } from "@/components/chatgpt/components/chatgpt-thinking"
import { ChatgptThread } from "@/components/chatgpt/components/chatgpt-thread"
import type { ChatgptActivitySource, ChatgptEffortId } from "@/components/chatgpt/types/chatgpt"
import { CodexCode, CodexList } from "@/components/codex/components/codex-markdown"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu/components/dropdown-menu"
import { PerplexityModelIcon } from "@/components/perplexity/components/perplexity-model-icon"
import type { PerplexityModelProvider } from "@/components/perplexity/types/perplexity"
import { StepSlider } from "@/components/step-slider/components/step-slider"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import "./chat.css"

export const WORKSPACE_MODELS = [
  { id: "gpt-codex", label: "GPT-6.1 Codex", provider: "openai", description: "Código e tarefas de desenvolvimento" },
  { id: "gpt", label: "GPT-6.1", provider: "openai", description: "Raciocínio e escrita" },
  { id: "claude-sonnet", label: "Claude Sonnet 4.6", provider: "anthropic", description: "Código e contexto extenso" },
  { id: "claude-opus", label: "Claude Opus 4.6", provider: "anthropic", description: "Análise e tarefas complexas" },
  { id: "gemini-pro", label: "Gemini 3.1 Pro", provider: "google", description: "Multimodal e contexto extenso" },
  { id: "grok", label: "Grok", provider: "xai", description: "Pesquisa e exploração" },
] satisfies { id: string; label: string; provider: PerplexityModelProvider; description: string }[]

export type ChatAttachment = { id: string; name: string; type: string; url?: string }
export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  model?: string
  reasoning?: boolean
  review?: boolean
}
export type ChatSession = {
  id: string
  title: string
  model: string
  effort: ChatgptEffortId
  draft: string
  busy: boolean
  messages: ChatMessage[]
  attachments: ChatAttachment[]
  agent?: string
  projectName?: string
}

export const WORKSPACE_INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "initial-user",
    role: "user",
    text: "Vamos redesenhar o workspace. Quero uma experiência mais cuidada, com projetos, modelos e conversas em paralelo.",
  },
  {
    id: "initial-assistant",
    role: "assistant",
    reasoning: true,
    review: true,
    text: "Organizei o workspace para deixar a conversa em primeiro plano e o contexto de trabalho sempre por perto.",
  },
]

const EFFORTS: { id: ChatgptEffortId; label: string; description: string }[] = [
  { id: "instant", label: "Rápido", description: "Para pequenos ajustes" },
  { id: "medium", label: "Médio", description: "Equilíbrio entre tempo e análise" },
  { id: "high", label: "Alto", description: "Mais tempo para raciocinar" },
  { id: "extra-high", label: "Máximo", description: "Para tarefas mais exigentes" },
]

const SOURCES: ChatgptActivitySource[] = [
  {
    id: "notra",
    domain: "ui.usenotra.com",
    publisher: "Notra UI",
    title: "ChatGPT Thread",
    snippet: "Thread com rolagem acompanhada e composer fixo.",
    timeLabel: "Documentação",
    href: "https://ui.usenotra.com/components/chatgpt/thread",
    favicon:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='5' fill='%23272727'/%3E%3Cpath d='M6 17V7l12 10V7' stroke='white' stroke-width='2' fill='none'/%3E%3C/svg%3E",
  },
  {
    id: "base",
    domain: "base-ui.com",
    publisher: "Base UI",
    title: "Primitivas acessíveis para React",
    snippet: "Menu, foco e navegação por teclado em componentes compostos.",
    timeLabel: "Documentação",
    href: "https://base-ui.com/react/overview/quick-start",
    favicon:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='5' fill='%23272727'/%3E%3Cpath d='M7 5h5a4 4 0 0 1 0 8H7zm0 8h6a3 3 0 0 1 0 6H7z' stroke='white' fill='none' stroke-width='2'/%3E%3C/svg%3E",
  },
]
const SITES = SOURCES.map((source) => ({ domain: source.domain, label: source.publisher, favicon: source.favicon }))

export function ModelLogo({ model, className }: { model: string; className?: string }) {
  const match = WORKSPACE_MODELS.find((entry) => entry.id === model || entry.label === model) || WORKSPACE_MODELS[0]
  return (
    <PerplexityModelIcon
      aria-hidden="true"
      provider={match.provider}
      className={cn("workspace-model-logo grayscale-0", className)}
    />
  )
}

function ModelMenu({
  session,
  onModelChange,
  onEffortChange,
}: {
  session: ChatSession
  onModelChange: (id: string) => void
  onEffortChange: (effort: ChatgptEffortId) => void
}) {
  const model = WORKSPACE_MODELS.find((entry) => entry.id === session.model) || WORKSPACE_MODELS[0]
  return (
    <div className="workspace-model-controls">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="workspace-model-trigger"
              aria-label={`Selecionar modelo: ${model.label}`}
            />
          }
        >
          <ModelLogo model={model.id} />
          <span className="truncate">{model.label}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" sideOffset={10} className="w-80 max-w-[calc(100vw-2rem)]">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Modelo da conversa</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuRadioGroup value={session.model} onValueChange={onModelChange}>
            {WORKSPACE_MODELS.map((entry) => (
              <DropdownMenuRadioItem closeOnClick key={entry.id} value={entry.id} className="gap-3 py-2.5">
                <ModelLogo model={entry.id} />
                <span className="min-w-0 flex-1">
                  <span className="block">{entry.label}</span>
                  <span className="block text-xs text-muted-foreground">{entry.description}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-normal">
              Catálogo ilustrativo · conexões nas configurações
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="sm" className="workspace-effort-trigger" aria-label="Esforço de raciocínio" />
          }
        >
          <span>{EFFORTS.find((effort) => effort.id === session.effort)?.label || "Alto"}</span>
          <ChevronDownIcon data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent align="start" side="top" sideOffset={10} className="w-80 max-w-[calc(100vw-2rem)] gap-5 p-5">
          <PopoverHeader>
            <PopoverTitle>Esforço de raciocínio</PopoverTitle>
            <PopoverDescription>
              {EFFORTS.find((effort) => effort.id === session.effort)?.description}
            </PopoverDescription>
          </PopoverHeader>
          <StepSlider
            aria-label="Esforço de raciocínio"
            steps={[0, 1, 2, 3]}
            value={Math.max(
              0,
              EFFORTS.findIndex((effort) => effort.id === session.effort),
            )}
            onValueChange={(value) => onEffortChange(EFFORTS[value].id)}
            formatLabel={(value) => EFFORTS[value].label}
            getValueText={(value) => EFFORTS[value].label}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function RevisionSummary({ onOpenReview }: { onOpenReview?: () => void }) {
  return (
    <div className="workspace-chat-revision">
      <Button variant="outline" className="h-auto w-full justify-start gap-3 py-3" onClick={onOpenReview}>
        <FolderGit2Icon data-icon="inline-start" />
        <span className="flex-1 text-left">
          <span className="block font-medium">3 arquivos alterados</span>
          <span className="block text-xs text-muted-foreground">Navegação, conversa e estilos</span>
        </span>
        <span className="workspace-diff-add">+148</span>
        <span className="workspace-diff-remove">−32</span>
        <ArrowUpRightIcon data-icon="inline-end" />
      </Button>
    </div>
  )
}

export function WorkspaceChat({
  session,
  onDraftChange,
  onSend,
  onStop,
  onModelChange,
  onEffortChange,
  onAttachmentsChange,
  onOpenReview,
  onAgentChange,
  compact = false,
}: {
  session: ChatSession
  onDraftChange: (value: string) => void
  onSend: (text: string) => void
  onStop: () => void
  onModelChange: (id: string) => void
  onEffortChange: (effort: ChatgptEffortId) => void
  onAttachmentsChange: (files: ChatAttachment[]) => void
  onOpenReview?: () => void
  onAgentChange?: (agent: string) => void
  compact?: boolean
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ChatAttachment | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [permission, setPermission] = useState("Padrão")
  const model = WORKSPACE_MODELS.find((entry) => entry.id === session.model) || WORKSPACE_MODELS[0]
  const attachments = session.attachments.length ? (
    <div className="flex min-w-0 flex-wrap gap-2">
      {session.attachments.map((attachment) => (
        <div className="workspace-attachment" key={attachment.id}>
          <Button
            variant="ghost"
            className="h-auto min-w-0 gap-2 px-2 py-1.5"
            onClick={() => setPreview(attachment)}
            aria-label={`Visualizar ${attachment.name}`}
          >
            {attachment.type.startsWith("image/") && attachment.url ? (
              <img src={attachment.url} alt="" />
            ) : (
              <FileIcon data-icon="inline-start" />
            )}
            <span className="max-w-32 truncate text-xs">{attachment.name}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remover ${attachment.name}`}
            onClick={() => onAttachmentsChange(session.attachments.filter((file) => file.id !== attachment.id))}
          >
            <XIcon />
          </Button>
        </div>
      ))}
    </div>
  ) : null

  const footer = (
    <div className="workspace-chat-footer">
      <ChatgptComposer
        busy={session.busy}
        value={session.draft}
        onValueChange={onDraftChange}
        placeholder="Descreva o que você quer construir…"
        onSend={onSend}
        onStop={onStop}
        onAttach={() => fileInput.current?.click()}
        modelSelector={<ModelMenu session={session} onModelChange={onModelChange} onEffortChange={onEffortChange} />}
        attachments={attachments}
      />
      <div className="workspace-chat-footnote">
        <span>
          <LaptopIcon />
          Local<span className="workspace-foot-separator">/</span>
          {session.projectName || "OpenCode"}
        </span>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label="Agente da conversa" />}>
              {session.agent || "Build"}
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-44">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Agente</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={session.agent || "Build"} onValueChange={onAgentChange}>
                  <DropdownMenuRadioItem closeOnClick value="Build">
                    Build
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem closeOnClick value="Plan">
                    Plan
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem closeOnClick value="Review">
                    Review
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label="Permissões da conversa" />}>
              <ShieldCheckIcon data-icon="inline-start" />
              {permission}
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Permissões demonstrativas</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setPermission("Padrão")}>
                  Padrão{permission === "Padrão" && <CheckIcon className="ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPermission("Acesso completo")}>
                  Acesso completo{permission === "Acesso completo" && <CheckIcon className="ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <input
        type="file"
        ref={fileInput}
        aria-label="Selecionar anexos"
        accept="image/*,.txt,.md,.pdf"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files || []).map((file) => ({
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type,
            url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
          }))
          onAttachmentsChange([...session.attachments, ...files])
          event.target.value = ""
        }}
      />
    </div>
  )

  return (
    <div className={cn("workspace-chat flex h-full min-h-0 flex-col", compact && "workspace-chat-compact")}>
      <ChatgptThread className="h-full min-h-0 flex-1" footer={footer}>
        {!session.messages.length ? (
          <Empty className="workspace-chat-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ModelLogo model={session.model} />
              </EmptyMedia>
              <EmptyTitle>O que vamos construir?</EmptyTitle>
              <EmptyDescription>
                Comece uma tarefa neste projeto. Você pode alternar de modelo e manter suas conversas em paralelo.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {session.messages.map((message) => (
          <ChatgptMessage
            key={message.id}
            from={message.role}
            actions={
              message.role === "assistant" ? (
                <ChatgptActions
                  text={message.text}
                  onRedo={() => onSend("Revise a resposta anterior e detalhe a proposta.")}
                  onShare={() =>
                    toast.info("Conversa local", {
                      description: "Compartilhamento disponível após conectar o workspace.",
                    })
                  }
                  onMore={() =>
                    toast.info("Conversa de demonstração", {
                      description: "Use as ações para copiar, revisar ou continuar o trabalho.",
                    })
                  }
                />
              ) : undefined
            }
            reasoning={
              message.reasoning ? (
                <div className="workspace-assistant-context">
                  <div className="workspace-assistant-model">
                    <ModelLogo model={message.model || session.model} />
                    <span>
                      {WORKSPACE_MODELS.find((entry) => entry.id === (message.model || session.model))?.label ||
                        model.label}
                    </span>
                  </div>
                  <ChatgptReasoning
                    seconds={12}
                    complete
                    search={
                      <ChatgptActivity
                        open={sourcesOpen}
                        onOpenChange={setSourcesOpen}
                        seconds={12}
                        sites={SITES}
                        sources={SOURCES}
                        websites={2}
                      />
                    }
                  >
                    <div className="flex flex-col gap-3">
                      <p>
                        Examinei a estrutura do workspace e os componentes existentes. A conversa precisa continuar
                        legível, com controles consistentes e contexto acessível.
                      </p>
                      <ChatgptAppCall label="Documentação consultada em" name="Notra UI" logo={<FileCode2Icon />} />
                    </div>
                  </ChatgptReasoning>
                </div>
              ) : undefined
            }
          >
            <div className="workspace-message-copy">{message.text}</div>
            {message.review ? (
              <div className="workspace-answer-detail">
                <p>O mesmo cuidado aparece em cada parte da interface:</p>
                <CodexList
                  items={[
                    <span key="navigation">
                      <strong>Navegação mais leve.</strong> Projetos e worktrees com suas conversas no mesmo lugar.
                    </span>,
                    <span key="conversation">
                      <strong>Um chat para trabalhar.</strong> Raciocínio recolhível, fontes e ações junto da resposta.
                    </span>,
                    <span key="context">
                      <strong>Contexto sem interrupção.</strong> Modelos, esforço e arquivos acessíveis no composer.
                    </span>,
                  ]}
                />
                <p>
                  Os componentes partem do <CodexCode>Notra UI</CodexCode> e compartilham o mesmo comportamento de foco,
                  navegação e movimento.
                  <ChatgptSourceChip sources={SOURCES.slice(0, 1)} />
                </p>
                <RevisionSummary onOpenReview={onOpenReview} />
                <p className="workspace-answer-close">A estrutura está pronta para explorarmos os detalhes juntos.</p>
              </div>
            ) : null}
          </ChatgptMessage>
        ))}
        {session.busy && <ChatgptThinking label="Organizando os próximos passos" />}
      </ChatgptThread>
      <Sheet
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      >
        <SheetContent className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{preview?.name || "Prévia do anexo"}</SheetTitle>
            <SheetDescription>Arquivo local nesta conversa. Nenhum upload foi realizado.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            {preview?.url ? (
              <img src={preview.url} alt={preview.name} className="max-h-[75vh] max-w-full rounded-xl object-contain" />
            ) : (
              <div className="text-center text-sm text-muted-foreground">
                <PaperclipIcon className="mx-auto mb-3 size-7" />
                <p>{preview?.name}</p>
                <p className="mt-1">A prévia visual está disponível para imagens.</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
