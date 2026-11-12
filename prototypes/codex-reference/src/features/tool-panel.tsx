import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  FileCode2,
  FileDiff,
  FileText,
  FolderOpen,
  GitBranch,
  Globe2,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Plug,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react"
import { cn } from "cn"
import { toast } from "sonner"
import { Button } from "@/components/button/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu/components/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip/components/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { ModelLogo } from "@/features/chat"
import { getConversationResources } from "@/features/conversation-resources"
import AppSource from "@/App.tsx?raw"
import ChatSource from "@/features/chat.tsx?raw"
import WorkspaceSource from "@/workspace.css?raw"
import PackageSource from "../../package.json?raw"
import "./tool-panel.css"

export type ToolKind =
  "home" | "changes" | "browser" | "terminal" | "files" | "agents" | "sources" | "artifacts" | "mcps" | "skills"

type ToolTab = {
  id: string
  kind: ToolKind
  history: string[]
  index: number
  address: string
  reload: number
}

type ToolState = {
  tabs: ToolTab[]
  selected: string
  file: string
  filter: string
  reviewed: boolean
  terminal: string[]
  commands: string[]
  draft: string
  toggles: Record<string, boolean>
  artifact: string
}

type ToolPanelProps = {
  sessionId: string
  sessionTitle: string
  project: string
  branch: string
  hasChanges: boolean
  busy: boolean
  activeTool: ToolKind
  onActiveToolChange: (tool: ToolKind) => void
  onClose: () => void
  tools?: ToolKind[]
}

const tools = [
  { kind: "changes", title: "Alterações", description: "Arquivos modificados e revisão de código", icon: FileDiff },
  { kind: "files", title: "Arquivos", description: "Explore o código deste protótipo", icon: FolderOpen },
  { kind: "browser", title: "Navegador", description: "Abra a documentação e páginas públicas", icon: Globe2 },
  { kind: "terminal", title: "Terminal", description: "Comandos locais de demonstração", icon: Terminal },
  { kind: "agents", title: "Subagentes", description: "Acompanhe o trabalho desta conversa", icon: Bot },
  { kind: "sources", title: "Fontes", description: "Referências consultadas na conversa", icon: Link2 },
  { kind: "artifacts", title: "Artefatos", description: "Documentos e resultados da conversa", icon: FileText },
  { kind: "mcps", title: "Servidores MCP", description: "Ferramentas disponíveis nesta conversa", icon: Plug },
  { kind: "skills", title: "Skills", description: "Instruções especializadas desta conversa", icon: Sparkles },
] satisfies { kind: ToolKind; title: string; description: string; icon: typeof FileDiff }[]

const files = [
  { path: "src/App.tsx", language: "TSX", content: AppSource },
  { path: "src/features/chat.tsx", language: "TSX", content: ChatSource },
  { path: "src/workspace.css", language: "CSS", content: WorkspaceSource },
  { path: "package.json", language: "JSON", content: PackageSource },
]

const changes = [
  {
    path: "src/features/chat.tsx",
    add: 86,
    remove: 18,
    lines: [
      "export function Conversation() {",
      "  return (",
      "-   <LegacyConversation />",
      "+   <ChatgptThread",
      "+     autoScroll",
      "+     footer={<ChatgptComposer />}",
      "+   >",
      "+     <Messages />",
      "+   </ChatgptThread>",
      "  )",
      "}",
    ],
  },
  {
    path: "src/App.tsx",
    add: 42,
    remove: 10,
    lines: [
      "export function Workspace() {",
      "  return (",
      "-   <LegacySidebar />",
      "+   <SidebarProvider>",
      "+     <Sidebar />",
      "+     <SidebarInset>",
      "+       <Conversations />",
      "+     </SidebarInset>",
      "+   </SidebarProvider>",
      "  )",
      "}",
    ],
  },
  {
    path: "src/workspace.css",
    add: 20,
    remove: 4,
    lines: [
      ":root {",
      "- --surface: #111214;",
      "+ --background: var(--chatgpt-bg);",
      "+ --foreground: var(--chatgpt-fg);",
      "+ --popover: var(--chatgpt-popover);",
      "+ --border: var(--chatgpt-border);",
      "}",
      "",
      "@media (prefers-reduced-motion: reduce) {",
      "+ * { scroll-behavior: auto; }",
      "}",
    ],
  },
]

function createTab(kind: ToolKind, id: string = crypto.randomUUID()): ToolTab {
  return { id, kind, history: ["https://ui.usenotra.com/"], index: 0, address: "https://ui.usenotra.com/", reload: 0 }
}

function initialState(kind: ToolKind, id: string): ToolState {
  const tab = createTab(kind, `${id}-initial`)
  return {
    tabs: [tab],
    selected: tab.id,
    file: files[0].path,
    filter: "",
    reviewed: false,
    terminal: ["OpenCodex · terminal de demonstração", "Digite help para explorar os comandos disponíveis."],
    commands: [],
    draft: "",
    toggles: {},
    artifact: "",
  }
}

function ToolAction({
  label,
  children,
  onClick,
  disabled = false,
  className,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className={className}
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function EmptyTool({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="tool-empty">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  )
}

export function ToolPanel({
  sessionId,
  project,
  branch,
  hasChanges,
  busy,
  activeTool,
  onActiveToolChange,
  onClose,
  tools: enabledTools,
}: ToolPanelProps) {
  const [sessions, setSessions] = useState<Record<string, ToolState>>({})
  const [copied, setCopied] = useState(false)
  const [commandIndex, setCommandIndex] = useState(-1)
  const addressInput = useRef<HTMLInputElement>(null)
  const terminalInput = useRef<HTMLInputElement>(null)
  const terminalOutput = useRef<HTMLDivElement>(null)
  const state = sessions[sessionId] || initialState(activeTool, sessionId)
  const tab = state.tabs.find((item) => item.id === state.selected) || state.tabs[0]
  const resources = getConversationResources(sessionId, busy)
  const available = tools.filter((tool) => !enabledTools || enabledTools.includes(tool.kind))
  const definition = tools.find((tool) => tool.kind === tab.kind)

  function update(patch: Partial<ToolState> | ((previous: ToolState) => ToolState)) {
    setSessions((previous) => {
      const current = previous[sessionId] || initialState(activeTool, sessionId)
      return { ...previous, [sessionId]: typeof patch === "function" ? patch(current) : { ...current, ...patch } }
    })
  }

  useEffect(() => {
    setSessions((previous) => {
      const current = previous[sessionId] || initialState(activeTool, sessionId)
      if (current.tabs.find((item) => item.id === current.selected)?.kind === activeTool) {
        return previous[sessionId] ? previous : { ...previous, [sessionId]: current }
      }
      const existing = current.tabs.find((item) => item.kind === activeTool)
      const next = existing || createTab(activeTool)
      return {
        ...previous,
        [sessionId]: { ...current, tabs: existing ? current.tabs : [...current.tabs, next], selected: next.id },
      }
    })
  }, [sessionId, activeTool])

  useEffect(() => {
    const output = terminalOutput.current
    if (output) output.scrollTop = output.scrollHeight
  }, [state.terminal.length, tab.kind])

  function selectTab(id: string) {
    const next = state.tabs.find((item) => item.id === id)
    if (!next) return
    update({ selected: id })
    onActiveToolChange(next.kind)
  }

  function openTool(kind: ToolKind, fresh = false) {
    const existing = !fresh && state.tabs.find((item) => item.kind === kind)
    if (existing) return selectTab(existing.id)
    const next = createTab(kind)
    update((previous) => ({ ...previous, tabs: [...previous.tabs, next], selected: next.id }))
    onActiveToolChange(kind)
  }

  function chooseTool(kind: ToolKind) {
    if (tab.kind !== "home") return openTool(kind)
    update((previous) => ({
      ...previous,
      tabs: previous.tabs.map((item) => (item.id === tab.id ? { ...item, kind } : item)),
    }))
    onActiveToolChange(kind)
  }

  function closeTab(id: string) {
    if (state.tabs.length === 1) return onClose()
    const remaining = state.tabs.filter((item) => item.id !== id)
    const selected =
      state.selected === id
        ? remaining[Math.max(0, state.tabs.findIndex((item) => item.id === id) - 1)]
        : remaining.find((item) => item.id === state.selected)
    update({ tabs: remaining, selected: selected!.id })
    onActiveToolChange(selected!.kind)
  }

  function updateBrowser(patch: Partial<ToolTab>) {
    update((previous) => ({
      ...previous,
      tabs: previous.tabs.map((item) => (item.id === tab.id ? { ...item, ...patch } : item)),
    }))
  }

  function navigate(value: string) {
    const input = value.trim()
    if (!input) return
    if (input === "app://preview")
      return updateBrowser({
        history: [...tab.history.slice(0, tab.index + 1), input],
        index: tab.index + 1,
        address: input,
      })
    const target = input.startsWith("http://") || input.startsWith("https://") ? input : `https://${input}`
    const url = URL.parse(target)
    if (!url || !["http:", "https:"].includes(url.protocol)) return
    updateBrowser({
      history: [...tab.history.slice(0, tab.index + 1), url.href],
      index: tab.index + 1,
      address: url.href,
    })
  }

  function openUrl(url: string) {
    const next = createTab("browser")
    next.history = [url]
    next.address = url
    update((previous) => ({ ...previous, tabs: [...previous.tabs, next], selected: next.id }))
    onActiveToolChange("browser")
  }

  function copy(text: string) {
    if (!navigator.clipboard) {
      toast("Não foi possível copiar", { description: "Abra o protótipo pelo servidor local e tente novamente." })
      return
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      })
      .catch(() =>
        toast("Não foi possível copiar", { description: "O navegador não permitiu acesso à área de transferência." }),
      )
  }

  function submitCommand() {
    const command = state.draft.trim()
    if (!command) return
    const outputs: Record<string, string> = {
      help: "help                 comandos disponíveis\npwd                  diretório de exemplo\nls                   arquivos do protótipo\ngit status           estado Git ilustrativo\ngit branch           branch desta conversa\nclear                limpar a tela",
      pwd: `/Projects/${project}`,
      ls: "src/\n  App.tsx\n  features/chat.tsx\n  workspace.css\npackage.json\nREADME.md",
      "git status": `On branch ${branch}\n${hasChanges ? "3 arquivos modificados (exemplo)." : "Nenhuma alteração nesta conversa (exemplo)."}\nNenhum comando Git foi executado.`,
      "git branch": `* ${branch}\n  dev`,
    }
    update({
      terminal:
        command === "clear"
          ? []
          : [
              ...state.terminal,
              `${project} › ${command}`,
              outputs[command] ||
                "Este terminal não executa processos. Digite help para ver os comandos de demonstração.",
            ],
      draft: "",
      commands: [...state.commands, command],
    })
    setCommandIndex(-1)
  }

  function renderHome() {
    return (
      <div className="tool-home">
        <h3>Ferramentas</h3>
        <div className="tool-launchers">
          {(["terminal", "files", "changes", "browser"] as const).map((kind) => {
            const tool = available.find((item) => item.kind === kind)
            if (!tool) return null
            return (
              <Button className="tool-launcher" variant="outline" key={kind} onClick={() => chooseTool(kind)}>
                <tool.icon size={17} strokeWidth={1.6} />
                <span>{tool.title}</span>
              </Button>
            )
          })}
        </div>
        <h3>Sugestões</h3>
        <div className="tool-suggestions">
          <Button variant="ghost" className="tool-suggestion" onClick={() => openUrl("https://ui.usenotra.com/")}>
            <Globe2 size={17} />
            <span>
              <strong>Notra UI</strong>
              <small>Componentes e referências de interface</small>
            </span>
            <ArrowRight size={14} />
          </Button>
          <Button
            variant="ghost"
            className="tool-suggestion"
            onClick={() => openUrl("https://ui.usenotra.com/components/chatgpt/thread")}
          >
            <BookOpen size={17} />
            <span>
              <strong>ChatGPT Thread</strong>
              <small>Conversa, mensagens e composer</small>
            </span>
            <ArrowRight size={14} />
          </Button>
        </div>
        <h3>Nesta conversa</h3>
        <div className="tool-conversation-resources">
          {(["agents", "sources", "artifacts", "mcps", "skills"] as const).map((kind) => {
            const tool = available.find((item) => item.kind === kind)
            if (!tool) return null
            return (
              <Button variant="ghost" className="tool-resource-launcher" key={kind} onClick={() => chooseTool(kind)}>
                <tool.icon size={16} strokeWidth={1.6} />
                <span>{tool.title}</span>
                <small>{resources[kind].length}</small>
                <ChevronRight size={13} />
              </Button>
            )
          })}
        </div>
        <div className="tool-context-note">
          <GitBranch size={13} />
          <span>
            {project} <span>/</span> {branch}
          </span>
        </div>
      </div>
    )
  }

  function renderChanges() {
    if (!hasChanges)
      return (
        <EmptyTool icon={<FileDiff />} title="Nenhuma alteração">
          Os arquivos modificados nesta conversa aparecerão aqui.
        </EmptyTool>
      )
    const selected = changes.find((file) => file.path === state.file) || changes[0]
    return (
      <div className="tool-changes">
        <div className="tool-changes-summary">
          <div>
            <strong>3 arquivos alterados</strong>
            <span>
              <b className="tool-added">+148</b>
              <b className="tool-removed">−32</b>
            </span>
          </div>
          <small>
            <GitBranch size={12} />
            {branch}
            <span>· Diff de demonstração</span>
          </small>
        </div>
        <div className="tool-changed-files">
          {changes.map((file) => (
            <Button
              key={file.path}
              variant="ghost"
              className={cn("tool-file-row", selected.path === file.path && "selected")}
              onClick={() => update({ file: file.path })}
            >
              <FileCode2 size={16} />
              <span>
                {file.path.split("/").at(-1)}
                <small>{file.path.split("/").slice(0, -1).join("/")}</small>
              </span>
              <span className="tool-file-stats">
                <b className="tool-added">+{file.add}</b>
                <b className="tool-removed">−{file.remove}</b>
              </span>
            </Button>
          ))}
        </div>
        <div className="tool-file-toolbar">
          <span>
            <FileCode2 size={13} />
            {selected.path}
          </span>
          <ToolAction label="Copiar diff" onClick={() => copy(selected.lines.join("\n"))}>
            {copied ? <Check /> : <Copy />}
          </ToolAction>
        </div>
        <ScrollArea className="tool-code-scroll">
          <div className="tool-diff-code">
            {selected.lines.map((line, index) => (
              <div
                key={`${index}-${line}`}
                className={line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : ""}
              >
                <span>{index + 1}</span>
                <code>{line}</code>
              </div>
            ))}
          </div>
          <div className="tool-diff-caption">
            <ShieldCheck size={15} />
            <span>
              Mudanças prontas para explorar<small>Estes trechos são exemplos, não o estado Git do projeto.</small>
            </span>
          </div>
        </ScrollArea>
        <div className="tool-bottom-action">
          <Button variant="outline" size="sm" onClick={() => update({ reviewed: !state.reviewed })}>
            {state.reviewed ? <CheckCheck size={15} /> : <Check size={15} />}
            {state.reviewed ? "Revisado" : "Marcar como revisado"}
          </Button>
        </div>
      </div>
    )
  }

  function renderFiles() {
    const selected = files.find((file) => file.path === state.file) || files[0]
    return (
      <div className="tool-files">
        <div className="tool-resource-heading">
          <span>
            <FolderOpen size={15} />
            {project}
          </span>
          <small>Arquivos reais do protótipo · leitura</small>
        </div>
        <div className="tool-file-search">
          <Search size={14} />
          <Input
            aria-label="Filtrar arquivos"
            value={state.filter}
            onChange={(event) => update({ filter: event.target.value })}
            placeholder="Buscar arquivo…"
          />
        </div>
        <div className="tool-file-tree">
          {files
            .filter((file) => file.path.toLowerCase().includes(state.filter.toLowerCase()))
            .map((file) => (
              <Button
                key={file.path}
                variant="ghost"
                className={cn("tool-tree-file", selected.path === file.path && "selected")}
                onClick={() => update({ file: file.path })}
              >
                <FileCode2 size={14} />
                <span>{file.path}</span>
                <small>{file.language}</small>
              </Button>
            ))}
          {!files.some((file) => file.path.toLowerCase().includes(state.filter.toLowerCase())) && (
            <p className="tool-no-results">Nenhum arquivo encontrado.</p>
          )}
        </div>
        <div className="tool-file-toolbar">
          <span>{selected.path}</span>
          <ToolAction label="Copiar arquivo" onClick={() => copy(selected.content)}>
            {copied ? <Check /> : <Copy />}
          </ToolAction>
        </div>
        <ScrollArea className="tool-code-scroll">
          <div className="tool-source-code">
            {selected.content.split("\n").map((line, index) => (
              <div key={index}>
                <span>{index + 1}</span>
                <code>{line || " "}</code>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="tool-panel-status">
          <FileCode2 size={12} />
          <span>{selected.language}</span>
          <span>{selected.content.split("\n").length} linhas</span>
          <span>Somente leitura</span>
        </div>
      </div>
    )
  }

  function renderBrowser() {
    const url = tab.history[tab.index]
    const local = url === "app://preview"
    return (
      <div className="tool-browser">
        <div className="tool-browser-toolbar">
          <ToolAction
            label="Voltar"
            onClick={() => updateBrowser({ index: tab.index - 1, address: tab.history[tab.index - 1] })}
            disabled={tab.index === 0}
          >
            <ArrowLeft />
          </ToolAction>
          <ToolAction
            label="Avançar"
            onClick={() => updateBrowser({ index: tab.index + 1, address: tab.history[tab.index + 1] })}
            disabled={tab.index >= tab.history.length - 1}
          >
            <ArrowRight />
          </ToolAction>
          <ToolAction label="Recarregar página" onClick={() => updateBrowser({ reload: tab.reload + 1 })}>
            <RefreshCw />
          </ToolAction>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              navigate(tab.address)
            }}
          >
            <Globe2 size={13} />
            <Input
              ref={addressInput}
              aria-label="Endereço da página"
              value={tab.address}
              onChange={(event) => updateBrowser({ address: event.target.value })}
              onFocus={(event) => event.target.select()}
            />
          </form>
          {!local && (
            <ToolAction
              label="Abrir página em outra guia"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink />
            </ToolAction>
          )}
        </div>
        {local ? (
          <div className="tool-local-preview">
            <div className="tool-local-preview-title">
              <span className="tool-preview-dot" />
              Prévia local de um artefato
            </div>
            <div className="tool-local-preview-content">
              <span className="tool-local-wordmark">OpenCodex</span>
              <h2>Um lugar para cada ideia.</h2>
              <p>Converse, explore o código e revise alterações sem perder o contexto.</p>
              <Button variant="outline" onClick={() => chooseTool("artifacts")}>
                <FileText size={15} />
                Ver artefatos da conversa
              </Button>
              <small>Prévia ilustrativa do layout; nenhum servidor externo é iniciado.</small>
            </div>
          </div>
        ) : (
          <iframe
            key={`${tab.id}-${url}-${tab.reload}`}
            src={url}
            title={`Navegador: ${url}`}
            className="tool-browser-frame"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="tool-browser-footer">
          <ShieldCheck size={12} />
          <span>{local ? "Conteúdo local demonstrativo" : "Alguns sites impedem a exibição incorporada."}</span>
          {!local && (
            <a href={url} target="_blank" rel="noreferrer">
              Abrir em outra guia <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    )
  }

  function renderTerminal() {
    return (
      <div className="tool-terminal">
        <div className="tool-terminal-toolbar">
          <span>
            <Terminal size={13} />
            {project}
            <small>· demonstração</small>
          </span>
          <Button variant="ghost" size="sm" onClick={() => update({ terminal: [] })}>
            Limpar
          </Button>
        </div>
        <div className="tool-terminal-output" ref={terminalOutput} aria-live="polite">
          {state.terminal.map((line, index) => (
            <div key={index} className={line.startsWith(`${project} ›`) ? "command" : ""}>
              {line || " "}
            </div>
          ))}
        </div>
        <form
          className="tool-terminal-prompt"
          onSubmit={(event) => {
            event.preventDefault()
            submitCommand()
          }}
        >
          <label htmlFor={`tool-terminal-${sessionId}`}>
            {project} <ChevronRight size={14} />
          </label>
          <input
            id={`tool-terminal-${sessionId}`}
            ref={terminalInput}
            aria-label="Comando do terminal"
            autoComplete="off"
            spellCheck={false}
            value={state.draft}
            placeholder="Digite help"
            onChange={(event) => update({ draft: event.target.value })}
            onKeyDown={(event) => {
              if (!["ArrowUp", "ArrowDown"].includes(event.key)) return
              event.preventDefault()
              const next =
                event.key === "ArrowUp"
                  ? Math.min(commandIndex + 1, state.commands.length - 1)
                  : Math.max(-1, commandIndex - 1)
              setCommandIndex(next)
              update({ draft: next < 0 ? "" : state.commands[state.commands.length - 1 - next] || "" })
            }}
          />
        </form>
        <div className="tool-panel-status">
          <ShieldCheck size={12} />
          <span>Nenhum processo ou comando real é executado.</span>
        </div>
      </div>
    )
  }

  function renderAgents() {
    if (!resources.agents.length)
      return (
        <EmptyTool icon={<Bot />} title="Nenhum subagente nesta conversa">
          Quando a conversa delegar uma tarefa, o trabalho aparecerá aqui.
        </EmptyTool>
      )
    return (
      <ScrollArea className="tool-resource-scroll">
        <div className="tool-resource-section">
          <div className="tool-resource-intro">
            <h3>Subagentes</h3>
            <span>{resources.agents.length} nesta conversa</span>
          </div>
          {resources.agents.map((agent) => (
            <details className="tool-agent" key={agent.id} open={agent.status === "running"}>
              <summary>
                <span className={cn("tool-agent-status", agent.status)}>
                  {agent.status === "running" ? <LoaderCircle size={15} /> : <Check size={15} />}
                </span>
                <span>
                  <strong>{agent.name}</strong>
                  <small>{agent.description}</small>
                </span>
                <ChevronDown size={14} />
              </summary>
              <div className="tool-agent-detail">
                <span>
                  <ModelLogo model={agent.model} />
                  {agent.model}
                </span>
                <p>
                  {agent.status === "running"
                    ? "Em andamento na simulação desta conversa."
                    : "Tarefa concluída no exemplo desta conversa."}
                </p>
              </div>
            </details>
          ))}
          <p className="tool-demo-note">Atividade ilustrativa, sem execução de agentes reais.</p>
        </div>
      </ScrollArea>
    )
  }

  function renderSources() {
    if (!resources.sources.length)
      return (
        <EmptyTool icon={<Link2 />} title="Nenhuma fonte nesta conversa">
          As referências usadas na resposta ficam reunidas aqui.
        </EmptyTool>
      )
    return (
      <ScrollArea className="tool-resource-scroll">
        <div className="tool-resource-section">
          <div className="tool-resource-intro">
            <h3>Fontes da conversa</h3>
            <span>{resources.sources.length} referências</span>
          </div>
          {resources.sources.map((source, index) => (
            <div className="tool-source-row" key={source.id}>
              <span className="tool-source-number">{index + 1}</span>
              <div>
                <strong>{source.name}</strong>
                <p>{source.description}</p>
                {source.url && (
                  <button type="button" onClick={() => openUrl(source.url!)}>
                    <Globe2 size={12} />
                    {new URL(source.url).hostname}
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
              {source.url && (
                <a href={source.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${source.name} em outra guia`}>
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    )
  }

  function renderArtifacts() {
    if (!resources.artifacts.length)
      return (
        <EmptyTool icon={<FileText />} title="Nenhum artefato nesta conversa">
          Documentos e resultados criados durante o trabalho aparecerão aqui.
        </EmptyTool>
      )
    const selected = resources.artifacts.find((artifact) => artifact.id === state.artifact) || resources.artifacts[0]
    return (
      <div className="tool-artifacts">
        <div className="tool-artifact-list">
          {resources.artifacts.map((artifact) => (
            <Button
              variant="ghost"
              className={cn("tool-artifact-row", selected.id === artifact.id && "selected")}
              key={artifact.id}
              onClick={() => update({ artifact: artifact.id })}
            >
              <FileText size={17} />
              <span>
                <strong>{artifact.name}</strong>
                <small>{artifact.description}</small>
              </span>
              <ChevronRight size={14} />
            </Button>
          ))}
        </div>
        <div className="tool-file-toolbar">
          <span>
            <FileText size={13} />
            {selected.name}
          </span>
          <div>
            <ToolAction label="Copiar artefato" onClick={() => copy(selected.content)}>
              {copied ? <Check /> : <Copy />}
            </ToolAction>
            <ToolAction
              label="Baixar artefato"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([selected.content], { type: "text/plain;charset=utf-8" }))
                const anchor = document.createElement("a")
                anchor.href = url
                anchor.download = selected.name
                anchor.click()
                URL.revokeObjectURL(url)
              }}
            >
              <ArrowDownToLine />
            </ToolAction>
          </div>
        </div>
        <ScrollArea className="tool-resource-scroll">
          <pre className="tool-artifact-content">{selected.content}</pre>
        </ScrollArea>
      </div>
    )
  }

  function renderConnections(kind: "mcps" | "skills") {
    const entries = resources[kind]
    if (!entries.length)
      return (
        <EmptyTool
          icon={kind === "mcps" ? <Plug /> : <Sparkles />}
          title={kind === "mcps" ? "Nenhum MCP nesta conversa" : "Nenhuma skill nesta conversa"}
        >
          Os recursos disponíveis para esta conversa serão listados aqui.
        </EmptyTool>
      )
    return (
      <ScrollArea className="tool-resource-scroll">
        <div className="tool-resource-section">
          <div className="tool-resource-intro">
            <h3>{kind === "mcps" ? "Servidores MCP" : "Skills da conversa"}</h3>
            <span>Configuração de demonstração</span>
          </div>
          {entries.map((entry) => {
            const key = `${kind}-${entry.id}`
            const enabled = state.toggles[key] ?? entry.enabled
            return (
              <div className="tool-integration" key={entry.id}>
                <span className="tool-integration-icon">
                  {kind === "mcps" ? <Plug size={18} /> : <Sparkles size={18} />}
                </span>
                <div>
                  <strong>{entry.name}</strong>
                  <p>{entry.description}</p>
                  <small>
                    <Circle size={6} fill="currentColor" />
                    {enabled ? "Disponível nesta conversa" : "Desativado nesta conversa"}
                  </small>
                </div>
                <Button
                  className={cn("tool-switch", enabled && "enabled")}
                  variant="ghost"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${enabled ? "Desativar" : "Ativar"} ${entry.name}`}
                  onClick={() => update({ toggles: { ...state.toggles, [key]: !enabled } })}
                >
                  <span />
                </Button>
              </div>
            )
          })}
          <p className="tool-demo-note">
            A alteração vale apenas para este exemplo da conversa. Nenhuma conexão externa é iniciada.
          </p>
        </div>
      </ScrollArea>
    )
  }

  return (
    <aside
      className="tool-panel"
      aria-label="Ferramentas da conversa"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
          event.preventDefault()
          event.stopPropagation()
          closeTab(tab.id)
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "t") {
          event.preventDefault()
          event.stopPropagation()
          openTool("home", true)
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l" && tab.kind === "browser") {
          event.preventDefault()
          event.stopPropagation()
          addressInput.current?.focus()
        }
      }}
    >
      <div className="tool-panel-tabs">
        <div className="tool-panel-tablist" role="tablist" aria-label="Ferramentas abertas">
          {state.tabs.map((item) => {
            const tool = tools.find((candidate) => candidate.kind === item.kind)
            const Icon = tool?.icon || LayoutDashboard
            return (
              <div key={item.id} className={cn("tool-panel-tab", item.id === tab.id && "active")}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={item.id === tab.id}
                  tabIndex={item.id === tab.id ? 0 : -1}
                  onClick={() => selectTab(item.id)}
                  onKeyDown={(event) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
                    event.preventDefault()
                    const index = state.tabs.findIndex((candidate) => candidate.id === item.id)
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? state.tabs.length - 1
                          : (index + (event.key === "ArrowLeft" ? -1 : 1) + state.tabs.length) % state.tabs.length
                    selectTab(state.tabs[next].id)
                    const buttons = event.currentTarget
                      .closest('[role="tablist"]')
                      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                    buttons?.[next].focus()
                  }}
                >
                  <Icon size={14} />
                  <span>{tool?.title || "Nova guia"}</span>
                </button>
                <button
                  type="button"
                  className="tool-tab-close"
                  aria-label={`Fechar guia ${tool?.title || "Nova guia"}`}
                  onClick={() => closeTab(item.id)}
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </div>
        <ToolAction className="tool-new-tab" label="Nova guia de ferramenta" onClick={() => openTool("home", true)}>
          <Plus />
        </ToolAction>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                className="tool-panel-menu-trigger"
                variant="ghost"
                size="icon-xs"
                aria-label="Menu das ferramentas"
              />
            }
          >
            <MoreHorizontal size={16} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="tool-panel-menu" align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Ferramentas da conversa</DropdownMenuLabel>
              {available.map((tool) => (
                <DropdownMenuItem key={tool.kind} onClick={() => openTool(tool.kind)}>
                  <tool.icon size={15} />
                  {tool.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => update({ tabs: [tab], selected: tab.id })}>
              <X size={15} />
              Fechar outras guias
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="tool-panel-body" role="tabpanel" aria-label={definition?.title || "Nova guia"}>
        {tab.kind === "home"
          ? renderHome()
          : tab.kind === "changes"
            ? renderChanges()
            : tab.kind === "files"
              ? renderFiles()
              : tab.kind === "browser"
                ? renderBrowser()
                : tab.kind === "terminal"
                  ? renderTerminal()
                  : tab.kind === "agents"
                    ? renderAgents()
                    : tab.kind === "sources"
                      ? renderSources()
                      : tab.kind === "artifacts"
                        ? renderArtifacts()
                        : renderConnections(tab.kind)}
      </div>
    </aside>
  )
}
