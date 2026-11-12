import { useEffect, useRef, useState } from "react"
import type { ComponentProps, ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CommandLineIcon,
  Folder01Icon,
  GitBranchIcon,
  GridViewIcon,
  Layers01Icon,
  Link01Icon,
  Message01Icon,
  Moon02Icon,
  PlusSignIcon,
  Settings01Icon,
  SearchIcon,
  SidebarRight01Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons"
import { Toaster } from "@/components/sonner/components/sonner"
import { toast } from "sonner"
import { cn } from "cn"
import { Button } from "@/components/button/components/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/sidebar/components/sidebar"
import { SidebarSearch } from "@/components/app-sidebar/components/sidebar-search"
import { SidebarUserMenu } from "@/components/app-sidebar/components/sidebar-user-menu"
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
import { IconTabs, IconTabsList, IconTabsTrigger } from "@/components/icon-tabs/components/icon-tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip/components/tooltip"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { WorkspaceChat, ModelLogo, WORKSPACE_INITIAL_MESSAGES, WORKSPACE_MODELS } from "@/features/chat"
import type { ChatSession } from "@/features/chat"
import { ToolPanel } from "@/features/tool-panel"
import type { ToolKind } from "@/features/tool-panel"
import { ConversationContext } from "@/features/conversation-context"

type Session = ChatSession & { project: string; branch: string; time: string }
type Project = { id: string; name: string; branches: string[] }
type Layout = "focus" | "grid" | "islands"
type Panel = "search" | "tools" | "project" | "worktree" | null

function Icon({ icon, ...props }: ComponentProps<typeof HugeiconsIcon>) {
  return <HugeiconsIcon icon={icon} size={18} strokeWidth={1.6} {...props} />
}

function IconAction({
  icon,
  label,
  onClick,
  pressed,
}: {
  icon: ComponentProps<typeof HugeiconsIcon>["icon"]
  label: string
  onClick: () => void
  pressed?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant={pressed ? "secondary" : "ghost"}
            aria-label={label}
            aria-pressed={pressed}
            onClick={onClick}
          />
        }
      >
        <Icon icon={icon} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const starterProjects: Project[] = [
  { id: "opencodex", name: "OpenCodex", branches: ["notra-workspace", "dev"] },
  { id: "cloud", name: "Cloud API", branches: ["main"] },
  { id: "design", name: "Design system", branches: ["tokens-v2"] },
]

function initialSessions(): Session[] {
  const base = { draft: "", busy: false, attachments: [], effort: "high" as const }
  const entries: Session[] = [
    {
      ...base,
      id: "workspace",
      title: "Uma nova experiência de trabalho",
      project: "opencodex",
      branch: "notra-workspace",
      time: "agora",
      model: "gpt-codex",
      messages: WORKSPACE_INITIAL_MESSAGES,
    },
    {
      ...base,
      id: "review",
      title: "Revisar a navegação",
      project: "opencodex",
      branch: "notra-workspace",
      time: "28 min",
      model: "claude-sonnet",
      messages: [
        { id: "review-u", role: "user", text: "Revise os estados de navegação e a organização das abas." },
        {
          id: "review-a",
          role: "assistant",
          text: "Revisei a navegação do workspace. A seleção fica explícita, as abas preservam seus rascunhos e os controles estão acessíveis por teclado.\n\nPodemos explorar cada estado juntos: foco, grade e ilhas usam as mesmas conversas.",
          review: true,
          reasoning: true,
        },
      ],
    },
    {
      ...base,
      id: "tests",
      title: "Cobrir os fluxos principais",
      project: "opencodex",
      branch: "dev",
      time: "2 h",
      model: "gpt-codex",
      messages: [
        { id: "tests-u", role: "user", text: "Organize os testes dos fluxos de conversa." },
        {
          id: "tests-a",
          role: "assistant",
          text: "Vou organizar a cobertura por comportamento: abrir conversas, preservar rascunhos, selecionar modelos e interromper respostas. Assim os testes acompanham o que você faz no aplicativo.",
        },
      ],
    },
    {
      ...base,
      id: "auth",
      title: "Simplificar a autenticação",
      project: "cloud",
      branch: "main",
      time: "3 h",
      model: "claude-opus",
      messages: [
        { id: "auth-u", role: "user", text: "Vamos revisar o fluxo de autenticação da API." },
        {
          id: "auth-a",
          role: "assistant",
          text: "Podemos começar pelos pontos de entrada e pelas mensagens de erro. Vou manter o fluxo de autorização separado da experiência da conversa, com estados claros para conectar, tentar novamente e cancelar.",
        },
      ],
    },
    {
      ...base,
      id: "tokens",
      title: "Ajustar os tokens de interface",
      project: "design",
      branch: "tokens-v2",
      time: "ontem",
      model: "gemini-pro",
      messages: [
        { id: "tokens-u", role: "user", text: "Revise a consistência dos tokens." },
        {
          id: "tokens-a",
          role: "assistant",
          text: "A base usa os tokens de interface do Notra. Superfícies, estados de foco, menus e controles compartilham os mesmos papéis de cor, com versões claras e escuras.",
        },
      ],
    },
  ]
  return entries.map((item) => ({
    ...item,
    messages: item.messages.map((message) => ({ ...message, model: item.model })),
  }))
}

const toolCatalog = {
  mcps: [
    { name: "GitHub", description: "Repositórios, issues e pull requests", enabled: true },
    { name: "Context7", description: "Documentação na conversa", enabled: true },
    { name: "Playwright", description: "Navegação e testes de interface", enabled: false },
  ],
  skills: [
    { name: "Interface design", description: "Composição, tipografia e interações", enabled: true },
    { name: "Code review", description: "Revisão independente de alterações", enabled: true },
    { name: "Testes de ponta a ponta", description: "Verificação dos fluxos de trabalho", enabled: false },
  ],
  plugins: [
    { name: "Workspace", description: "Projetos, worktrees e sessões paralelas", enabled: true },
    { name: "Diff & review", description: "Alterações próximas da conversa", enabled: true },
    { name: "Terminal", description: "Comandos de exemplo no protótipo", enabled: true },
  ],
  connections: [
    { name: "OpenAI", description: "API / CLI · GPT Codex", enabled: true },
    { name: "Anthropic", description: "API / CLI · Claude", enabled: true },
    { name: "Google", description: "API · Gemini", enabled: true },
    { name: "xAI", description: "API · Grok", enabled: false },
  ],
}

export default function App() {
  const [sessions, setSessions] = useState(initialSessions)
  const [projects, setProjects] = useState(starterProjects)
  const [tabs, setTabs] = useState(["workspace", "review"])
  const [active, setActive] = useState("workspace")
  const [layout, setLayout] = useState<Layout>("focus")
  const [toolPanelOpen, setToolPanelOpen] = useState(false)
  const [sessionTools, setSessionTools] = useState<Record<string, ToolKind>>({})
  const [contextOpen, setContextOpen] = useState(() => window.innerWidth >= 1180)
  const [panel, setPanel] = useState<Panel>(null)
  const [query, setQuery] = useState("")
  const [name, setName] = useState("")
  const [toolTab, setToolTab] = useState<keyof typeof toolCatalog>("mcps")
  const [tools, setTools] = useState(toolCatalog)
  const [formError, setFormError] = useState("")
  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>())
  const dragging = useRef<string | null>(null)
  const [theme, setTheme] = useState(() =>
    localStorage.getItem("opencodex-notra-theme") === "light" ? "light" : "dark",
  )
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.style.colorScheme = theme
    localStorage.setItem("opencodex-notra-theme", theme)
  }, [theme])
  const session = sessions.find((item) => item.id === active)
  const activeTool = sessionTools[active] || "home"
  const selectedProject = projects.find((item) => item.id === session?.project) || projects[0]
  const openSessions = tabs.flatMap((id) => sessions.filter((item) => item.id === id))
  const searchResults = sessions.filter((item) =>
    `${item.title} ${projects.find((project) => project.id === item.project)?.name}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  )

  useEffect(() => () => timers.current.forEach(clearInterval), [])
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPanel("search")
        setQuery("")
      }
      if (event.altKey && ["1", "2", "3"].includes(event.key)) {
        event.preventDefault()
        setLayout((["focus", "grid", "islands"] as const)[Number(event.key) - 1])
      }
    }
    window.addEventListener("keydown", handle)
    return () => window.removeEventListener("keydown", handle)
  }, [])

  function update(id: string, patch: Partial<ChatSession>) {
    if (patch.attachments)
      sessions
        .find((item) => item.id === id)
        ?.attachments.filter((file) => file.url && !patch.attachments?.some((next) => next.id === file.id))
        .forEach((file) => URL.revokeObjectURL(file.url!))
    setSessions((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function open(id: string) {
    setTabs((items) => (items.includes(id) ? items : [...items, id]))
    setActive(id)
  }

  function close(id: string) {
    const remaining = tabs.filter((item) => item !== id)
    setTabs(remaining)
    if (active === id) setActive(remaining.at(-1) || "")
  }

  function create(project = selectedProject.id, branch = session?.branch || selectedProject.branches[0]) {
    const id = crypto.randomUUID()
    setSessions((items) => [
      ...items,
      {
        id,
        title: "Nova conversa",
        project,
        branch,
        time: "agora",
        model: session?.model || "gpt-codex",
        effort: session?.effort || "high",
        draft: "",
        busy: false,
        attachments: [],
        messages: [],
      },
    ])
    open(id)
    setLayout("focus")
    return id
  }

  function send(id: string, text: string) {
    const target = sessions.find((item) => item.id === id)
    if (!target || target.busy) return
    const replyId = crypto.randomUUID()
    const attachmentText = target.attachments.length
      ? `\n\nAnexos: ${target.attachments.map((item) => item.name).join(", ")}`
      : ""
    const reply =
      "Entendi. Vou manter a conversa, os modelos e as alterações organizados no mesmo workspace.\n\nNeste protótipo, você pode explorar os componentes reais do Notra: troque o modelo, abra o raciocínio, veja as fontes, revise os arquivos ou continue em outra conversa. O seu rascunho fica preservado em cada sessão.\n\nEsta resposta é uma simulação local; nenhum modelo ou serviço externo foi acionado."
    update(id, {
      title: target.messages.length ? target.title : text.slice(0, 38) || "Conversa com anexo",
      draft: "",
      attachments: [],
      busy: true,
      messages: [
        ...target.messages,
        { id: crypto.randomUUID(), role: "user", text: text + attachmentText },
        { id: replyId, role: "assistant", text: "", model: target.model },
      ],
    })
    const progress = { offset: 0 }
    const timer = setInterval(() => {
      progress.offset = Math.min(progress.offset + 14, reply.length)
      setSessions((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                busy: progress.offset < reply.length,
                messages: item.messages.map((message) =>
                  message.id === replyId ? { ...message, text: reply.slice(0, progress.offset) } : message,
                ),
              }
            : item,
        ),
      )
      if (progress.offset >= reply.length) {
        clearInterval(timer)
        timers.current.delete(id)
      }
    }, 65)
    timers.current.set(id, timer)
  }

  function stop(id: string) {
    clearInterval(timers.current.get(id))
    timers.current.delete(id)
    setSessions((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              busy: false,
              messages: [
                ...item.messages,
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  text: "Resposta interrompida. Você pode continuar quando quiser.",
                },
              ],
            }
          : item,
      ),
    )
    toast("Resposta interrompida")
  }

  function createItem() {
    if (!name.trim()) {
      setFormError("Informe um nome para continuar.")
      return
    }
    if (panel === "project") {
      const id = crypto.randomUUID()
      setProjects((items) => [...items, { id, name: name.trim(), branches: ["main"] }])
      create(id, "main")
    }
    if (panel === "worktree") {
      if (selectedProject.branches.includes(name.trim())) {
        setFormError("Esta worktree já existe neste projeto.")
        return
      }
      setProjects((items) =>
        items.map((item) =>
          item.id === selectedProject.id ? { ...item, branches: [...item.branches, name.trim()] } : item,
        ),
      )
      create(selectedProject.id, name.trim())
    }
    setPanel(null)
    setName("")
    setFormError("")
  }

  function newPanel(value: Panel) {
    setName("")
    setQuery("")
    setFormError("")
    setPanel(value)
  }

  function selectTool(tool: ToolKind, id = active) {
    setSessionTools((previous) => ({ ...previous, [id]: tool }))
  }

  function openTool(tool: ToolKind, id = active) {
    selectTool(tool, id)
    setToolPanelOpen(true)
    setContextOpen(false)
  }

  return (
    <>
      <Toaster theme={theme === "dark" ? "dark" : "light"} />
      <SidebarProvider defaultWidth={284} className="workspace-shell" mobileBreakpoint={780}>
        <WorkspaceSidebar
          projects={projects}
          sessions={sessions}
          active={active}
          onOpen={open}
          onCreate={create}
          onPanel={newPanel}
          onTools={() => newPanel("tools")}
          onTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        />
        <SidebarInset className="workspace-main">
          <header className="workspace-toolbar">
            <div className="flex min-w-0 items-center gap-2">
              <MobileSidebarTrigger />
              <span className="toolbar-project">{selectedProject.name}</span>
              <Icon icon={ArrowRight01Icon} className="toolbar-separator" />
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="branch-button" />}>
                  <Icon icon={GitBranchIcon} />
                  <span className="truncate">{session?.branch || "main"}</span>
                  <Icon icon={ArrowDown01Icon} />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-60">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Worktrees</DropdownMenuLabel>
                    {selectedProject.branches.map((branch) => (
                      <DropdownMenuItem
                        key={branch}
                        onClick={() => {
                          const target = sessions.find(
                            (item) => item.project === selectedProject.id && item.branch === branch,
                          )
                          if (target) open(target.id)
                          else create(selectedProject.id, branch)
                        }}
                      >
                        <Icon icon={GitBranchIcon} />
                        {branch}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => newPanel("worktree")}>
                      <Icon icon={PlusSignIcon} />
                      Nova worktree
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="toolbar-quick-terminal">
                <IconAction icon={CommandLineIcon} label="Abrir terminal" onClick={() => openTool("terminal")} />
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button size="icon-sm" variant="ghost" aria-label="Layout do workspace" />}
                >
                  <Icon icon={layout === "focus" ? Message01Icon : layout === "grid" ? GridViewIcon : Layers01Icon} />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Visualização</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={layout} onValueChange={(value) => setLayout(value as Layout)}>
                      <DropdownMenuRadioItem closeOnClick value="focus">
                        Conversa em foco
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem closeOnClick value="grid">
                        Grade de conversas
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem closeOnClick value="islands">
                        Ilhas de trabalho
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <IconAction
                icon={SlidersHorizontalIcon}
                label={contextOpen && layout === "focus" ? "Fechar contexto da conversa" : "Abrir contexto da conversa"}
                pressed={contextOpen && layout === "focus"}
                onClick={() => {
                  setLayout("focus")
                  setContextOpen((value) => !value)
                }}
              />
              <span className="toolbar-action-divider" />
              <IconAction
                icon={SidebarRight01Icon}
                label={toolPanelOpen ? "Fechar painel de ferramentas" : "Abrir painel de ferramentas"}
                pressed={toolPanelOpen}
                onClick={() => {
                  setToolPanelOpen((value) => !value)
                  setContextOpen(false)
                }}
              />
            </div>
          </header>
          <div className="workspace-tabs-row">
            <IconTabs
              value={active}
              onValueChange={(value) => setActive(String(value))}
              className="workspace-session-tabs"
            >
              <IconTabsList key={tabs.join(",")} value={active} aria-label="Conversas abertas">
                {openSessions.map((item) => (
                  <div
                    className="session-tab-group"
                    key={item.id}
                    draggable
                    onDragStart={() => {
                      dragging.current = item.id
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      const source = dragging.current
                      if (!source || source === item.id) return
                      setTabs((ids) => {
                        const order = ids.filter((id) => id !== source)
                        order.splice(order.indexOf(item.id), 0, source)
                        return order
                      })
                    }}
                  >
                    <IconTabsTrigger
                      value={item.id}
                      data-session-id={item.id}
                      icon={<ModelLogo model={item.model} />}
                      iconPinned
                      onKeyDown={(event) => {
                        if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return
                        event.preventDefault()
                        const next = [...tabs]
                        const from = next.indexOf(item.id)
                        const to = Math.max(0, Math.min(next.length - 1, from + (event.key === "ArrowLeft" ? -1 : 1)))
                        next.splice(to, 0, next.splice(from, 1)[0])
                        setTabs(next)
                        requestAnimationFrame(() =>
                          document.querySelector<HTMLButtonElement>(`[data-session-id="${item.id}"]`)?.focus(),
                        )
                      }}
                    >
                      <span className="session-tab-title">{item.title}</span>
                      {item.busy && <span className="running-dot" />}
                    </IconTabsTrigger>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Fechar ${item.title}`}
                      className="session-tab-close"
                      onClick={() => close(item.id)}
                    >
                      <Icon icon={Cancel01Icon} />
                    </Button>
                  </div>
                ))}
              </IconTabsList>
            </IconTabs>
            <IconAction icon={PlusSignIcon} label="Nova aba" onClick={() => create()} />
          </div>
          <div
            className={cn(
              "workspace-content",
              toolPanelOpen && "has-tool-panel",
              contextOpen && layout === "focus" && "has-context",
            )}
          >
            <main
              className={cn(
                "workspace-conversations",
                layout !== "focus" && "parallel-conversations",
                layout === "islands" && "island-conversations",
              )}
              aria-label="Área de conversas"
            >
              {openSessions.length ? (
                openSessions.map((item) => (
                  <SessionPane
                    key={item.id}
                    hidden={layout === "focus" && item.id !== active}
                    session={item}
                    layout={layout}
                    onFocus={() => {
                      setActive(item.id)
                      setLayout("focus")
                    }}
                  >
                    <WorkspaceChat
                      session={{ ...item, projectName: projects.find((project) => project.id === item.project)?.name }}
                      onDraftChange={(value) => update(item.id, { draft: value })}
                      onSend={(text) => send(item.id, text)}
                      onStop={() => stop(item.id)}
                      onModelChange={(value) => update(item.id, { model: value })}
                      onEffortChange={(value) => update(item.id, { effort: value })}
                      onAttachmentsChange={(value) => update(item.id, { attachments: value })}
                      onAgentChange={(value) => update(item.id, { agent: value })}
                      onOpenReview={() => {
                        setActive(item.id)
                        openTool("changes", item.id)
                      }}
                      compact={layout !== "focus"}
                    />
                  </SessionPane>
                ))
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>Um espaço para a próxima ideia.</EmptyTitle>
                    <EmptyDescription>Abra uma conversa dos seus projetos ou comece algo novo.</EmptyDescription>
                  </EmptyHeader>
                  <Button onClick={() => create()}>
                    <Icon icon={PlusSignIcon} />
                    Nova conversa
                  </Button>
                </Empty>
              )}
            </main>
            {contextOpen && layout === "focus" && session && (
              <ConversationContext
                session={session}
                project={selectedProject.name}
                onOpenTool={openTool}
                onClose={() => setContextOpen(false)}
              />
            )}
            <aside className="workspace-tools-panel" aria-label="Painel de ferramentas" hidden={!toolPanelOpen}>
              <ToolPanel
                sessionId={session?.id || "empty"}
                sessionTitle={session?.title || "Workspace"}
                project={selectedProject.name}
                branch={session?.branch || "main"}
                hasChanges={Boolean(session?.messages.some((item) => item.review))}
                busy={Boolean(session?.busy)}
                activeTool={activeTool}
                onActiveToolChange={selectTool}
                onClose={() => setToolPanelOpen(false)}
              />
            </aside>
          </div>
        </SidebarInset>
        <Sheet
          open={panel !== null}
          onOpenChange={(value) => {
            if (!value) setPanel(null)
          }}
        >
          <SheetContent side="right" className="workspace-settings-sheet">
            <SheetHeader>
              <SheetTitle>
                {
                  {
                    search: "Buscar conversas",
                    tools: "Ferramentas do workspace",
                    project: "Novo projeto",
                    worktree: "Nova worktree",
                  }[panel || "search"]
                }
              </SheetTitle>
              <SheetDescription>
                {panel === "tools"
                  ? "Seus modelos, conexões e recursos em um só lugar."
                  : panel === "search"
                    ? "Encontre uma ideia em qualquer projeto."
                    : "Organize uma nova frente de trabalho neste protótipo."}
              </SheetDescription>
            </SheetHeader>
            {panel === "search" && (
              <div className="sheet-body">
                <Input
                  autoFocus
                  placeholder="Buscar por conversa ou projeto…"
                  aria-label="Buscar conversas"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="search-results">
                  {sessions
                    .filter((item) =>
                      `${item.title} ${projects.find((project) => project.id === item.project)?.name}`
                        .toLocaleLowerCase()
                        .includes(query.toLocaleLowerCase()),
                    )
                    .map((item) => (
                      <Button
                        variant="ghost"
                        className="search-result"
                        key={item.id}
                        onClick={() => {
                          open(item.id)
                          setPanel(null)
                        }}
                      >
                        <ModelLogo model={item.model} />
                        <span>
                          <strong>{item.title}</strong>
                          <small>
                            {projects.find((project) => project.id === item.project)?.name} · {item.branch}
                          </small>
                        </span>
                        <Icon icon={ArrowRight01Icon} />
                      </Button>
                    ))}
                </div>
                {!searchResults.length && (
                  <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada para esse termo.</p>
                )}
              </div>
            )}
            {panel === "tools" && (
              <div className="sheet-body">
                <IconTabs value={toolTab} onValueChange={(value) => setToolTab(value as keyof typeof toolCatalog)}>
                  <IconTabsList value={toolTab} aria-label="Categorias de ferramentas">
                    <IconTabsTrigger value="mcps" icon={<Icon icon={Link01Icon} />}>
                      MCPs
                    </IconTabsTrigger>
                    <IconTabsTrigger value="skills" icon={<Icon icon={Layers01Icon} />}>
                      Skills
                    </IconTabsTrigger>
                    <IconTabsTrigger value="plugins" icon={<Icon icon={GridViewIcon} />}>
                      Plugins
                    </IconTabsTrigger>
                    <IconTabsTrigger value="connections" icon={<Icon icon={CommandLineIcon} />}>
                      Modelos
                    </IconTabsTrigger>
                  </IconTabsList>
                </IconTabs>
                <div className="tool-list">
                  {tools[toolTab].map((tool, index) => (
                    <div className="tool-row" key={tool.name}>
                      <span className="tool-logo">
                        {toolTab === "connections" ? (
                          <ModelLogo
                            model={
                              WORKSPACE_MODELS.find((model) => model.provider === tool.name.toLowerCase())?.id ||
                              "gpt-codex"
                            }
                          />
                        ) : (
                          <Icon
                            icon={toolTab === "mcps" ? Link01Icon : toolTab === "skills" ? Layers01Icon : GridViewIcon}
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong>{tool.name}</strong>
                        <small>{tool.description}</small>
                      </span>
                      <Button
                        size="sm"
                        variant={tool.enabled ? "outline" : "secondary"}
                        role="switch"
                        aria-checked={tool.enabled}
                        aria-label={tool.name}
                        onClick={() =>
                          setTools((current) => ({
                            ...current,
                            [toolTab]: current[toolTab].map((item, itemIndex) =>
                              itemIndex === index ? { ...item, enabled: !item.enabled } : item,
                            ),
                          }))
                        }
                      >
                        {tool.enabled ? "Ativo" : "Ativar"}
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="demo-note">
                  Conexões e ferramentas são demonstrativas. Não é necessário informar credenciais.
                </p>
              </div>
            )}
            {(panel === "project" || panel === "worktree") && (
              <form
                className="sheet-body"
                onSubmit={(event) => {
                  event.preventDefault()
                  createItem()
                }}
              >
                <Field data-invalid={Boolean(formError)}>
                  <FieldLabel htmlFor="item-name">
                    {panel === "project" ? "Nome do projeto" : "Nome da branch"}
                  </FieldLabel>
                  <Input
                    id="item-name"
                    autoFocus
                    value={name}
                    aria-invalid={Boolean(formError)}
                    onChange={(event) => {
                      setName(event.target.value)
                      setFormError("")
                    }}
                    placeholder={panel === "project" ? "Meu próximo projeto" : "minha-nova-ideia"}
                  />
                  <FieldDescription>
                    {formError ||
                      (panel === "worktree"
                        ? `Criada em ${selectedProject.name}, a partir da branch atual.`
                        : "O projeto será adicionado ao seu workspace de demonstração.")}
                  </FieldDescription>
                </Field>
                <Button type="submit">
                  <Icon icon={PlusSignIcon} />
                  {panel === "project" ? "Criar projeto" : "Criar worktree"}
                </Button>
              </form>
            )}
          </SheetContent>
        </Sheet>
      </SidebarProvider>
    </>
  )
}

function MobileSidebarTrigger() {
  const sidebar = useSidebar()
  return sidebar.isMobile ? <SidebarTrigger aria-label="Abrir navegação" /> : null
}

function WorkspaceSidebar({
  projects,
  sessions,
  active,
  onOpen,
  onCreate,
  onPanel,
  onTools,
  onTheme,
}: {
  projects: Project[]
  sessions: Session[]
  active: string
  onOpen: (id: string) => void
  onCreate: (project?: string, branch?: string) => void
  onPanel: (panel: Panel) => void
  onTools: () => void
  onTheme: () => void
}) {
  const sidebar = useSidebar()
  const compact = !sidebar.isMobile && !sidebar.open
  function open(id: string) {
    onOpen(id)
    if (sidebar.isMobile) sidebar.setOpenMobile(false)
  }
  return (
    <Sidebar
      collapsible="icon"
      className="workspace-sidebar"
      data-compact={compact}
      mobileTitle="Navegação do workspace"
      mobileDescription="Projetos, worktrees e conversas"
    >
      <SidebarHeader>
        {compact ? (
          <div className="compact-brand">
            <SidebarTrigger aria-label="Expandir navegação" />
          </div>
        ) : (
          <div className="brand-row">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" tooltip="OpenCodex" onClick={() => onCreate()}>
                  <Icon icon={CommandLineIcon} />
                  <SidebarLabel className="brand-name">OpenCodex</SidebarLabel>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarTrigger aria-label="Recolher navegação" />
          </div>
        )}
      </SidebarHeader>
      {!compact && (
        <div className="sidebar-search-wrap">
          <SidebarSearch label="Buscar conversas" shortcut="Ctrl K" onClick={() => onPanel("search")} />
        </div>
      )}
      <SidebarContent>
        {compact ? (
          <div className="compact-navigation">
            <SidebarMenu>
              {[
                { label: "Buscar conversas", icon: SearchIcon, action: () => onPanel("search") },
                { label: "Nova conversa", icon: PlusSignIcon, action: () => onCreate() },
                { label: "Skills e ferramentas", icon: Layers01Icon, action: onTools },
              ].map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton tooltip={item.label} aria-label={item.label} onClick={item.action}>
                    <Icon icon={item.icon} />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            <div className="compact-divider" />
            <SidebarMenu aria-label="Projetos">
              {projects.map((project) => (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    tooltip={project.name}
                    aria-label={`Abrir projeto ${project.name}`}
                    isActive={sessions.some((item) => item.id === active && item.project === project.id)}
                    onClick={() => {
                      const target = sessions.find((item) => item.project === project.id)
                      if (target) open(target.id)
                      else onCreate(project.id, project.branches[0])
                    }}
                  >
                    <Icon icon={Folder01Icon} />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Adicionar projeto"
                  aria-label="Adicionar projeto"
                  onClick={() => onPanel("project")}
                >
                  <Icon icon={PlusSignIcon} />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        ) : (
          <>
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Nova conversa"
                    onClick={() => {
                      onCreate()
                      sidebar.setOpenMobile(false)
                    }}
                  >
                    <Icon icon={PlusSignIcon} />
                    <SidebarLabel>Nova conversa</SidebarLabel>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Skills e ferramentas" onClick={onTools}>
                    <Icon icon={Layers01Icon} />
                    <SidebarLabel>Skills e ferramentas</SidebarLabel>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel className="project-group-label">
                <span>Projetos</span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Adicionar projeto"
                  onClick={() => onPanel("project")}
                >
                  <Icon icon={PlusSignIcon} />
                </Button>
              </SidebarGroupLabel>
              <SidebarMenu>
                {projects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger render={<SidebarMenuButton tooltip={project.name} className="project-row" />}>
                        <Icon icon={Folder01Icon} />
                        <SidebarLabel>{project.name}</SidebarLabel>
                        <Icon icon={ArrowDown01Icon} className="ml-auto project-chevron" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="project-worktrees">
                          {project.branches.map((branch) => (
                            <SidebarMenuSubItem key={branch} className="worktree-node">
                              <Collapsible defaultOpen>
                                <div
                                  className={cn(
                                    "sidebar-branch",
                                    sessions.some(
                                      (item) =>
                                        item.id === active && item.project === project.id && item.branch === branch,
                                    ) && "current-branch",
                                  )}
                                >
                                  <CollapsibleTrigger
                                    render={<button className="worktree-toggle" aria-label={`Worktree ${branch}`} />}
                                  >
                                    <Icon icon={ArrowDown01Icon} className="worktree-chevron" />
                                    <Icon icon={GitBranchIcon} />
                                    <span>{branch}</span>
                                    <span className="worktree-count" title="Conversas nesta worktree">
                                      {
                                        sessions.filter((item) => item.project === project.id && item.branch === branch)
                                          .length
                                      }
                                    </span>
                                  </CollapsibleTrigger>
                                  <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label={`Nova conversa em ${branch}`}
                                    onClick={() => {
                                      onCreate(project.id, branch)
                                      sidebar.setOpenMobile(false)
                                    }}
                                  >
                                    <Icon icon={PlusSignIcon} />
                                  </Button>
                                </div>
                                <CollapsibleContent>
                                  <SidebarMenu className="worktree-conversations" aria-label={`Conversas em ${branch}`}>
                                    {sessions
                                      .filter((item) => item.project === project.id && item.branch === branch)
                                      .map((item) => (
                                        <SidebarMenuSubItem key={item.id}>
                                          <SidebarMenuSubButton
                                            isActive={item.id === active}
                                            render={<button onClick={() => open(item.id)} />}
                                          >
                                            <span
                                              className={cn(
                                                "sidebar-session-state",
                                                item.busy && "is-running",
                                                item.id === active && "is-current",
                                              )}
                                            />
                                            <Icon icon={Message01Icon} className="tree-conversation-icon" />
                                            <span className="truncate">{item.title}</span>
                                            <span className="session-age">{item.time}</span>
                                          </SidebarMenuSubButton>
                                        </SidebarMenuSubItem>
                                      ))}
                                  </SidebarMenu>
                                </CollapsibleContent>
                              </Collapsible>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarUserMenu name="Meu workspace" email="Local · projeto pessoal">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onTheme}>
              <Icon icon={Moon02Icon} />
              Alternar tema
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTools}>
              <Icon icon={Settings01Icon} />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                toast("OpenCodex × Notra UI", {
                  description: "Protótipo de interface. Conversas e integrações são simuladas.",
                })
              }
            >
              Sobre este workspace
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </SidebarUserMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function SessionPane({
  children,
  hidden,
  session,
  layout,
  onFocus,
}: {
  children: ReactNode
  hidden: boolean
  session: Session
  layout: Layout
  onFocus: () => void
}) {
  const node = useRef<HTMLElement>(null)
  const origin = useRef({ x: 0, y: 0, startX: 0, startY: 0 })
  return (
    <section
      ref={node}
      hidden={hidden}
      className={cn("session-pane", layout !== "focus" && "parallel-pane")}
      id={`session-${session.id}`}
      aria-label={session.title}
    >
      {layout !== "focus" && (
        <header
          className="pane-header"
          onPointerDown={(event) => {
            if (layout !== "islands" || (event.target as HTMLElement).closest("button")) return
            origin.current = {
              x: event.clientX,
              y: event.clientY,
              startX: Number(node.current?.dataset.x || 0),
              startY: Number(node.current?.dataset.y || 0),
            }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId) || !node.current) return
            const x = Math.max(-40, Math.min(80, origin.current.startX + event.clientX - origin.current.x))
            const y = Math.max(0, Math.min(160, origin.current.startY + event.clientY - origin.current.y))
            node.current.style.transform = `translate(${x}px, ${y}px)`
            node.current.dataset.x = String(x)
            node.current.dataset.y = String(y)
          }}
        >
          <ModelLogo model={session.model} />
          <span className="truncate">{session.title}</span>
          <Button size="icon-xs" variant="ghost" aria-label={`Ampliar ${session.title}`} onClick={onFocus}>
            <Icon icon={ArrowRight01Icon} />
          </Button>
        </header>
      )}
      {children}
    </section>
  )
}
