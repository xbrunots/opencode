;(() => {
  const icon = Icons.svg
  const esc = (value = "") =>
    String(value).replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    )
  const projects = [
    {
      id: "opencode",
      name: "OpenCode",
      open: true,
      trees: [
        { id: "dev", name: "dev", sessions: ["workspace", "tests", "sync"] },
        { id: "ui", name: "interface", sessions: ["visual"] },
      ],
    },
    { id: "cloud", name: "Cloud API", open: true, trees: [{ id: "main", name: "main", sessions: ["auth"] }] },
    {
      id: "design",
      name: "Design system",
      open: false,
      trees: [{ id: "tokens", name: "tokens", sessions: ["tokens"] }],
    },
  ]
  const sessions = [
    {
      id: "workspace",
      title: "Refinar o workspace",
      project: "opencode",
      tree: "dev",
      time: "agora",
      model: "GPT-6.1 Codex",
      effort: "Alto",
      prompt: "Vamos simplificar o workspace sem perder projetos, worktrees e conversas em paralelo.",
      answer:
        "Vou reorganizar a interface para que a conversa fique em primeiro plano, mantendo os projetos e as alterações acessíveis quando você precisar.",
      activity: [
        "Explorei a estrutura do workspace",
        "Revisei a navegação de projetos",
        "Atualizei os componentes da conversa",
      ],
      files: true,
    },
    {
      id: "tests",
      title: "Executar os testes",
      project: "opencode",
      tree: "dev",
      time: "2h",
      model: "Claude Sonnet 4.6",
      effort: "Médio",
      prompt: "Confira os testes da interface e corrija eventuais falhas.",
      answer:
        "Revisei os fluxos principais de navegação e preparei as verificações para os estados de conversa, seleção e painéis.",
      activity: ["Examinei os testes existentes", "Verifiquei a navegação por teclado"],
      files: true,
    },
    {
      id: "sync",
      title: "Sincronizar com upstream",
      project: "opencode",
      tree: "dev",
      time: "1d",
      model: "GPT-6.1 Codex",
      effort: "Alto",
      prompt: "Analise como manter o fork atualizado.",
      answer:
        "Acompanhei as mudanças da branch principal e organizei os pontos que precisam ser revisados antes da próxima sincronização.",
      activity: ["Revisei o histórico do repositório"],
      files: false,
    },
    {
      id: "visual",
      title: "Ajustar o tema escuro",
      project: "opencode",
      tree: "interface",
      time: "3d",
      model: "GPT-6.1",
      effort: "Médio",
      prompt: "Ajuste os tons e o contraste da interface.",
      answer:
        "A paleta usa superfícies neutras e contraste discreto para manter a conversa legível durante sessões longas.",
      activity: ["Comparei os estados da interface"],
      files: true,
    },
    {
      id: "auth",
      title: "Fluxo de autenticação",
      project: "cloud",
      tree: "main",
      time: "1d",
      model: "Claude Sonnet 4.6",
      effort: "Alto",
      prompt: "Revise o fluxo de autenticação da API.",
      answer: "Identifiquei os pontos de entrada e organizei o fluxo em etapas menores para facilitar a revisão.",
      activity: ["Explorei os arquivos de autenticação"],
      files: false,
    },
    {
      id: "tokens",
      title: "Revisar componentes",
      project: "design",
      tree: "tokens",
      time: "4d",
      model: "GPT-6.1",
      effort: "Médio",
      prompt: "Revise os componentes compartilhados.",
      answer: "Listei os componentes que podem ser reutilizados entre as telas e os estados que precisam de atenção.",
      activity: ["Revisei os componentes compartilhados"],
      files: false,
    },
  ]
  const requestedView = new URLSearchParams(location.search).get("view")
  const initialTheme = requestedView === "light" ? "light" : requestedView === "review" ? "review" : "dark"
  const state = {
    projects,
    sessions,
    active: "workspace",
    tabs: ["workspace", "tests"],
    sidebar: true,
    mobileSidebar: false,
    review: initialTheme === "review",
    theme: initialTheme,
    view: "tabs",
    draft: "",
    attachments: [],
    mcp: [true, true, false],
    skills: [true, true, false],
    plugins: [true, true, false],
    terminal: false,
    terminalLines: ["Terminal local · demonstração", "Digite help para ver os comandos disponíveis."],
    connections: ["OpenAI", "Anthropic"],
  }
  const app = document.getElementById("app")
  const dialog = document.getElementById("dialog")
  const attachment = document.getElementById("attachment")
  const timers = new Map()
  const scrollPositions = new Map()
  const models = [
    { provider: "OpenAI", names: ["GPT-6.1 Codex", "GPT-6.1"] },
    { provider: "Anthropic", names: ["Claude Sonnet 4.6", "Claude Opus 4.6"] },
    { provider: "Google", names: ["Gemini 3.1 Pro"] },
    { provider: "Ollama", names: ["Qwen Coder local"] },
  ]
  const focusReturn = { selector: "#draft" }
  const current = () => state.sessions.find((entry) => entry.id === state.active)
  const project = (id) => state.projects.find((entry) => entry.id === id)
  const button = (name, label, action, extra = "") =>
    `<button type="button" class="icon-button" data-action="${action}" aria-label="${label}" title="${label}" ${extra}>${icon(name)}</button>`

  function openSession(id) {
    if (current()) {
      current().draft = state.draft
      current().attachments = state.attachments
    }
    state.active = id
    if (!state.tabs.includes(id)) state.tabs.push(id)
    state.mobileSidebar = false
    state.draft = current()?.draft || ""
    state.attachments = current()?.attachments || []
    render()
  }

  function closeSession(id) {
    if (current()) {
      current().draft = state.draft
      current().attachments = state.attachments
    }
    state.tabs = state.tabs.filter((tab) => tab !== id)
    if (state.active === id) {
      state.active = state.tabs.at(-1) || ""
      state.draft = current()?.draft || ""
      state.attachments = current()?.attachments || []
    }
    render()
    document.querySelector('.tab[aria-selected="true"]')?.focus()
  }

  function sidebar() {
    return `<aside class="sidebar" aria-label="Projetos e conversas" ${(innerWidth <= 800 ? !state.mobileSidebar : !state.sidebar) ? "inert" : ""}><div class="side-top"><span class="wordmark">OpenCodex</span>${button("panels", "Ocultar barra lateral", "sidebar")}</div><div class="side-actions"><button class="nav-button" data-action="new">${icon("plus")} Nova conversa</button><button class="nav-button" data-action="search">${icon("search")} Buscar conversas</button><button class="nav-button" data-action="skills">${icon("book")} Skills</button><button class="nav-button" data-action="mcps">${icon("plug")} MCPs</button></div><div class="sidebar-scroll"><div class="section-header"><span>Projetos</span>${button("plus", "Adicionar projeto", "project-add")}</div>${state.projects
      .map(
        (item) =>
          `<section><button class="project-button" data-action="project" data-id="${item.id}" aria-expanded="${item.open}">${icon("folder")}<span>${esc(item.name)}</span>${icon("chevron", "chevron")}</button>${
            item.open
              ? item.trees
                  .map(
                    (tree) =>
                      `<div class="worktree-label">${icon("branch")} ${esc(tree.name)}<button data-action="new" data-id="${item.id}" data-value="${tree.id}" title="Nova conversa nesta worktree" aria-label="Nova conversa nesta worktree">+</button><button data-action="tree-new" data-id="${item.id}" title="Nova worktree" aria-label="Nova worktree">${icon("branch")}</button></div>${tree.sessions
                        .map((id) => {
                          const entry = state.sessions.find((session) => session.id === id)
                          return entry
                            ? `<button class="thread-button ${id === state.active ? "active" : ""}" data-action="open" data-id="${id}"><i class="dot ${id === state.active ? "" : "done"}"></i><span class="title">${esc(entry.title)}</span><small>${esc(entry.time)}</small></button>`
                            : ""
                        })
                        .join(
                          "",
                        )}${tree.sessions.length ? "" : `<button class="thread-button" data-action="new" data-id="${item.id}" data-value="${tree.id}">+ Iniciar conversa</button>`}`,
                  )
                  .join("")
              : ""
          }</section>`,
      )
      .join(
        "",
      )}</div><div class="sidebar-bottom"><button class="account" data-action="about"><span class="avatar">B</span> Meu workspace</button>${button("settings", "Configurações", "settings")}</div></aside>`
  }

  function message(entry) {
    if (!entry?.prompt)
      return `<div class="empty"><span class="empty-logo">${icon("logo")}</span><strong>Comece uma conversa</strong><span>Descreva o que você quer construir.</span></div>`
    return `<div class="conversation"><div class="user-message">${esc(entry.prompt)}</div><div class="assistant-message"><p>${esc(entry.answer)}</p>${entry.activity?.length ? `<details class="activity" open><summary class="activity-heading">${entry.activity.length} atividades</summary>${entry.activity.map((row) => `<div class="activity-row">${icon("check")} ${esc(row)}</div>`).join("")}</details>` : ""}${entry.files ? `<div class="result"><strong>Alterações prontas para revisão</strong><p>Organizei a navegação e mantive os controles próximos da conversa.</p><button class="file-inline" data-action="show-review">${icon("code")} src/workspace.tsx <small>+48 −12</small></button><button class="file-inline" data-action="show-review">${icon("code")} src/styles.css <small>+29 −8</small></button></div>` : ""}${(entry.messages || []).map((item) => (item.role === "user" ? `<div class="user-message">${esc(item.text)}</div>` : `<p>${esc(item.text)}</p>`)).join("")}${entry.running ? '<p class="working">Trabalhando…</p>' : ""}</div></div>`
  }

  function review() {
    if (!current()?.files)
      return `<aside class="review" aria-label="Alterações"><div class="review-head"><strong>Alterações</strong>${button("close", "Fechar alterações", "review")}</div><div class="review-body"><p>Nenhuma alteração nesta conversa.</p></div></aside>`
    return `<aside class="review" aria-label="Alterações"><div class="review-head"><strong>Alterações</strong>${button("close", "Fechar alterações", "review")}</div><div class="review-body"><p class="review-summary">2 arquivos alterados <span class="add">+77</span> <span class="del">−20</span></p><div class="file-card"><div class="file-title">${icon("code")} src/workspace.tsx <small><span class="add">+48</span> <span class="del">−12</span></small></div><div class="code"><div>  <span class="keyword">export function</span> Workspace() {</div><div>    <span class="keyword">return</span> (</div><div class="removed">−     &lt;Layout sidebar={false}&gt;</div><div class="added">+     &lt;Layout sidebar={projects}&gt;</div><div class="added">+       &lt;Conversation /&gt;</div><div class="added">+       &lt;ChangesPanel /&gt;</div><div>      &lt;/Layout&gt;</div><div>    )</div><div>  }</div></div></div><div class="file-card"><div class="file-title">${icon("code")} src/styles.css <small><span class="add">+29</span> <span class="del">−8</span></small></div><div class="code"><div>  .workspace {</div><div class="removed">−   grid-template-columns: 1fr;</div><div class="added">+   grid-template-columns: auto 1fr;</div><div>    min-height: 0;</div><div>  }</div></div></div></div></aside>`
  }

  function render() {
    document.querySelectorAll("[data-scroll]").forEach((element) => {
      scrollPositions.set(element.dataset.scroll, [element.scrollLeft, element.scrollTop])
    })
    const focused = document.activeElement
    const caret = focused?.id === "draft" ? [focused.selectionStart, focused.selectionEnd] : null
    const entry = current()
    document.documentElement.dataset.theme = state.theme === "light" ? "light" : "dark"
    app.innerHTML = `<div class="shell ${state.sidebar ? "" : "sidebar-hidden"} ${state.mobileSidebar ? "mobile-sidebar" : ""}">${sidebar()}<div class="main"><header class="topbar"><div class="top-left">${button("panels", "Mostrar ou ocultar projetos", "sidebar")}<span class="top-title">${esc(entry?.title || "Nova conversa")}</span><span class="top-project">${icon("folder")} ${esc(project(entry?.project)?.name || "OpenCode")}</span></div><div class="top-right">${button("terminal", "Abrir terminal", "terminal")}<button class="text-button open-button" data-action="appearance">Aparência ${icon("chevron-down")}</button><button class="text-button" data-action="review">${icon("git-compare")} Alterações</button></div></header><div class="work-area"><main class="center"><div class="tabs" data-scroll="tabs" role="tablist" aria-label="Conversas abertas">${state.tabs
      .map((id) => {
        const tab = state.sessions.find((item) => item.id === id)
        return tab
          ? `<div class="tab-wrap ${state.active === id ? "active" : ""}" data-session="${id}"><button class="tab" role="tab" aria-selected="${state.active === id}" data-action="open" data-id="${id}">${esc(tab.title)}</button><button class="close-tab" data-action="close-tab" data-id="${id}" aria-label="Fechar ${esc(tab.title)}">${icon("close")}</button></div>`
          : ""
      })
      .join(
        "",
      )}<span class="tabs-spacer"></span><div class="view-switch" aria-label="Visualização">${state.view === "islands" ? button("refresh", "Organizar ilhas", "reset-panels") : ""}${[
      ["tabs", "tabs", "Abas"],
      ["grid", "grid", "Grade"],
      ["islands", "islands", "Ilhas"],
    ]
      .map(([key, symbol, label]) =>
        button(symbol, label, "view", `data-value="${key}" aria-pressed="${state.view === key}"`),
      )
      .join("")}</div></div>${
      state.view === "tabs"
        ? `<div class="conversation-area" id="conversation" data-scroll="conversation-${esc(entry?.id || "empty")}">${message(entry)}</div>${composer(entry)}`
        : `<div class="grid-view ${state.view === "islands" ? "island-view" : ""}">${state.tabs
            .map((id) => {
              const item = state.sessions.find((candidate) => candidate.id === id)
              return item
                ? `<article class="grid-panel" data-session="${id}" data-scroll="panel-${id}"><header data-drag-handle><button data-action="focus" data-id="${id}">${esc(item.title)}</button><span class="panel-model">${esc(item.model)}</span></header>${message(item)}</article>`
                : ""
            })
            .join("")}</div>${composer(entry)}`
    }${state.terminal ? terminal() : ""}</main>${state.review ? review() : ""}</div></div></div>`
    const input = document.querySelector("#draft")
    if (input) input.value = state.draft
    document.querySelector(".sidebar-scroll").dataset.scroll = "sidebar"
    document.querySelector(".review-body")?.setAttribute("data-scroll", "review")
    document.querySelectorAll("[data-scroll]").forEach((element) => {
      const position = scrollPositions.get(element.dataset.scroll)
      if (position) element.scrollTo(...position)
    })
    if (caret && !dialog.open) {
      input.focus({ preventScroll: true })
      input.setSelectionRange(...caret)
    }
    window.Panels?.mount({
      root: app,
      mode: state.view,
      onOrder: (ids) => {
        state.tabs = ids
        render()
      },
    })
  }

  function composer(entry) {
    return `<div class="composer-wrap"><div class="composer">${state.attachments.map((file, index) => `<span class="attachment-chip">${file.url ? `<button data-action="preview-attachment" data-id="${index}" aria-label="Visualizar ${esc(file.name)}"><img src="${file.url}" alt=""></button>` : ""}${esc(file.name)} <button data-action="remove-attachment" data-id="${index}" aria-label="Remover anexo">×</button></span>`).join("")}<textarea id="draft" placeholder="Peça ao OpenCodex para fazer algo..." aria-label="Mensagem" ${entry ? "" : "autofocus"}>${esc(state.draft)}</textarea><div class="composer-actions"><div class="composer-controls">${button("plus", "Anexar arquivo", "attach")}<button class="text-button" data-action="models">${esc(entry?.model || "GPT-6.1 Codex")} ${icon("chevron-down")}</button><button class="text-button" data-action="effort">${esc(entry?.effort || "Alto")} ${icon("chevron-down")}</button></div><button class="send" data-action="${entry?.running ? "stop" : "send"}" aria-label="${entry?.running ? "Interromper resposta" : "Enviar mensagem"}">${entry?.running ? '<span class="stop-square"></span>' : icon("arrow-up")}</button></div></div><div class="composer-foot"><span>${icon("laptop")} Local</span><button class="text-button agent-control" data-action="agents">${esc(entry?.agent || "Build")} ${icon("chevron-down")}</button><button class="text-button" data-action="permissions">${icon("shield")} Acesso padrão ${icon("chevron-down")}</button></div></div>`
  }

  function showDialog(title, body, picker = false) {
    const trigger = document.activeElement
    const bounds = trigger.getBoundingClientRect()
    if (!dialog.open)
      focusReturn.selector = trigger.id
        ? `#${trigger.id}`
        : trigger.dataset.action
          ? `[data-action="${trigger.dataset.action}"]`
          : "#draft"
    dialog.classList.toggle("picker", picker)
    dialog.style.cssText = ""
    dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2>${button("close", "Fechar", "dialog-close")}</div><div class="dialog-body">${body}</div>`
    if (!dialog.open) dialog.showModal()
    if (picker) {
      dialog.style.left = `${Math.max(12, Math.min(bounds.left, innerWidth - dialog.offsetWidth - 12))}px`
      dialog.style.top = `${Math.max(12, bounds.top > dialog.offsetHeight + 12 ? bounds.top - dialog.offsetHeight - 8 : Math.min(bounds.bottom + 8, innerHeight - dialog.offsetHeight - 12))}px`
    }
    dialog.querySelector("input")?.focus()
  }
  function options(title, values, selected, action) {
    showDialog(
      title,
      `<div class="dialog-list">${values.map((value) => `<button class="dialog-option ${value === selected ? "selected" : ""}" data-action="${action}" data-value="${esc(value)}"><span>${esc(value)}</span>${value === selected ? icon("check") : ""}</button>`).join("")}</div>`,
      true,
    )
  }
  function collection(type) {
    const names =
      type === "mcps"
        ? ["Context7", "GitHub", "Playwright"]
        : type === "plugins"
          ? ["Diff & review", "Terminal", "Token lens"]
          : ["Code review", "Interface design", "Testes de ponta a ponta"]
    const values = type === "mcps" ? state.mcp : state[type]
    showDialog(
      type === "mcps" ? "Servidores MCP" : type === "plugins" ? "Plugins" : "Skills",
      `<p>Ative ou desative os itens disponíveis nesta demonstração.</p><div class="dialog-list">${names.map((name, index) => `<button class="dialog-option" role="switch" aria-checked="${values[index]}" data-action="toggle-collection" data-value="${type}" data-id="${index}"><span>${esc(name)}</span><i aria-hidden="true" class="toggle ${values[index] ? "on" : ""}"></i></button>`).join("")}</div>`,
    )
  }
  function newSession(projectID, treeID) {
    const parent = project(projectID || current()?.project) || state.projects[0]
    const tree = parent.trees.find((item) => item.id === (treeID || current()?.tree)) || parent.trees[0]
    const id = `session-${Date.now()}`
    state.sessions.push({
      id,
      title: "Nova conversa",
      project: parent.id,
      tree: tree.id,
      time: "agora",
      model: "GPT-6.1 Codex",
      effort: "Alto",
      prompt: "",
      answer: "",
      activity: [],
      files: false,
    })
    tree.sessions.unshift(id)
    parent.open = true
    openSession(id)
  }

  function terminal() {
    return `<section class="terminal-panel" aria-label="Terminal"><header><strong>${icon("terminal")} Terminal <small>· demonstração</small></strong>${button("close", "Fechar terminal", "terminal")}</header><div class="terminal-output" data-scroll="terminal">${state.terminalLines.map((line) => `<div>${esc(line)}</div>`).join("")}</div><form id="terminal-form"><label for="terminal-input">${esc(project(current()?.project)?.name || "workspace")} ›</label><input id="terminal-input" autocomplete="off" spellcheck="false" aria-label="Comando do terminal" placeholder="help"></form></section>`
  }

  function settings() {
    showDialog(
      "Configurações",
      `<div class="dialog-list">${[
        ["appearance", "palette", "Aparência"],
        ["connections", "globe", "Provedores e conexões"],
        ["plugins", "puzzle", "Plugins"],
        ["mcps", "plug", "Servidores MCP"],
        ["skills", "book", "Skills"],
      ]
        .map(
          ([action, symbol, label]) =>
            `<button class="dialog-option" data-action="${action}">${icon(symbol)}<span>${label}</span>${icon("chevron")}</button>`,
        )
        .join("")}</div><p class="settings-note">Protótipo local. Os dados e as integrações são demonstrativos.</p>`,
    )
  }

  function connections() {
    showDialog(
      "Provedores e conexões",
      `<p>Explore as conexões do protótipo. Não use credenciais reais.</p><div class="dialog-list">${models.map((provider) => `<button class="dialog-option" data-action="connect-provider" data-value="${provider.provider}"><span><strong>${provider.provider}</strong><small class="provider-description">${provider.names.length} modelos · ${provider.provider === "Ollama" ? "Local" : "API / CLI"}</small></span><small>${state.connections.includes(provider.provider) ? "Conectado" : "Conectar"}</small>${icon("chevron")}</button>`).join("")}</div>`,
    )
  }
  function send() {
    const text = state.draft.trim()
    if (!text && !state.attachments.length) return
    const attachments = state.attachments
    if (!current()) newSession()
    const entry = current()
    if (entry.running) return
    const body = `${text}${attachments.length ? `\nAnexos: ${attachments.map((file) => file.name).join(", ")}` : ""}`
    if (!entry.prompt) {
      entry.prompt = body
      entry.title = text.slice(0, 34) || "Nova conversa"
      entry.answer = "Entendi. Vou examinar o contexto e organizar os próximos passos."
    } else {
      entry.messages ||= []
      entry.messages.push({ role: "user", text: body })
    }
    state.draft = ""
    entry.draft = ""
    attachments.forEach((file) => {
      if (file.url) URL.revokeObjectURL(file.url)
    })
    state.attachments = []
    entry.attachments = []
    entry.running = true
    render()
    timers.set(
      entry.id,
      setTimeout(() => {
        entry.running = false
        timers.delete(entry.id)
        entry.messages ||= []
        entry.messages.push({
          role: "assistant",
          text: "Nesta demonstração, a conversa é simulada. Você pode trocar de modelo, abrir outra sessão ou explorar as alterações ao lado.",
        })
        const conversation = document.getElementById("conversation")
        const following =
          conversation && conversation.scrollHeight - conversation.clientHeight - conversation.scrollTop < 80
        render()
        if (current()?.id === entry.id && following) document.getElementById("conversation")?.scrollTo(0, 99999)
        document.getElementById("status").textContent = `Resposta concluída em ${entry.title}.`
      }, 2200),
    )
  }

  document.addEventListener("input", (event) => {
    if (event.target.id === "draft") {
      state.draft = event.target.value
      if (current()) current().draft = state.draft
    }
    if (event.target.id === "search-input") {
      const term = event.target.value.toLocaleLowerCase()
      document.querySelectorAll("[data-search]").forEach((item) => {
        item.hidden = !item.dataset.search.includes(term)
      })
    }
  })
  document.addEventListener("keydown", (event) => {
    if (event.isComposing) return
    if (event.target.id === "draft" && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      send()
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault()
      document.querySelector('[data-action="search"]').click()
    }
    if (dialog.open) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
      event.preventDefault()
      closeSession(state.active)
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
      event.preventDefault()
      document.querySelector('[data-action="sidebar"]').click()
    }
    if (event.altKey && ["1", "2", "3"].includes(event.key)) {
      event.preventDefault()
      state.view = ["tabs", "grid", "islands"][Number(event.key) - 1]
      render()
    }
  })
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "terminal-form") return
    event.preventDefault()
    const input = document.getElementById("terminal-input")
    const command = input.value.trim()
    const result = {
      help: "help · pwd · ls · git status · git branch · clear",
      pwd: `/Projects/${project(current()?.project)?.name || "workspace"}`,
      ls: "src/  tests/  package.json  README.md",
      "git status": "On branch dev\n2 arquivos alterados (exemplo).",
      "git branch": "* dev\n  interface",
    }[command]
    state.terminalLines =
      command === "clear"
        ? []
        : [...state.terminalLines, `› ${command}`, result || "Comando indisponível nesta demonstração. Digite help."]
    render()
    document.getElementById("terminal-input").focus()
    const output = document.querySelector(".terminal-output")
    output.scrollTop = output.scrollHeight
  })
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return
    const bounds = dialog.getBoundingClientRect()
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      dialog.close()
  })
  dialog.addEventListener("close", () => document.querySelector(focusReturn.selector)?.focus({ preventScroll: true }))
  matchMedia("(max-width: 800px)").addEventListener("change", () => render())
  attachment.addEventListener("change", () => {
    state.attachments.push(
      ...Array.from(attachment.files, (file) => ({
        name: file.name,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      })),
    )
    attachment.value = ""
    if (current()) current().attachments = state.attachments
    render()
  })
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]")
    if (!target) return
    const action = target.dataset.action
    const value = target.dataset.value
    const id = target.dataset.id
    if (action === "dialog-close") return dialog.close()
    if (action === "open") return openSession(id)
    if (action === "close-tab") {
      event.stopPropagation()
      return closeSession(id)
    }
    if (action === "new") return newSession(id, value)
    if (action === "sidebar") {
      if (innerWidth <= 800) state.mobileSidebar = !state.mobileSidebar
      else state.sidebar = !state.sidebar
      return render()
    }
    if (action === "project") {
      const item = project(id)
      item.open = !item.open
      return render()
    }
    if (action === "review") {
      state.review = !state.review
      return render()
    }
    if (action === "show-review") {
      state.review = true
      return render()
    }
    if (action === "view") {
      state.view = value
      return render()
    }
    if (action === "reset-panels") {
      window.Panels.reset()
      return render()
    }
    if (action === "terminal") {
      state.terminal = !state.terminal
      render()
      document.getElementById("terminal-input")?.focus()
      return
    }
    if (action === "focus") {
      state.view = "tabs"
      return openSession(id)
    }
    if (action === "settings") return settings()
    if (action === "connections") return connections()
    if (action === "connect-provider")
      return showDialog(
        `Conectar ${esc(value)}`,
        `<p>Conexão demonstrativa: escolha como este provedor apareceria no workspace. Nenhuma credencial será solicitada.</p><div class="dialog-list"><button class="dialog-option" data-action="authorize-provider" data-value="${esc(value)}"><span>Conexão API de exemplo</span>${icon("arrow-right")}</button><button class="dialog-option" data-action="authorize-provider" data-value="${esc(value)}"><span>CLI / ACP de exemplo</span>${icon("arrow-right")}</button></div>`,
      )
    if (action === "authorize-provider") {
      if (!state.connections.includes(value)) state.connections.push(value)
      return connections()
    }
    if (action === "appearance")
      return options(
        "Aparência",
        ["Escuro", "Claro", "Escuro com revisão"],
        state.theme === "light" ? "Claro" : state.theme === "review" ? "Escuro com revisão" : "Escuro",
        "set-appearance",
      )
    if (action === "set-appearance") {
      state.theme = value === "Claro" ? "light" : value === "Escuro com revisão" ? "review" : "dark"
      state.review = value === "Escuro com revisão"
      const url = new URL(location.href)
      url.searchParams.set("view", state.theme === "dark" ? "focus" : state.theme)
      history.replaceState(null, "", url)
      dialog.close()
      return render()
    }
    if (action === "models")
      return showDialog(
        "Selecionar modelo",
        `<div class="dialog-list">${models.map((provider) => `<div class="provider-label">${provider.provider}</div>${provider.names.map((name) => `<button class="dialog-option ${name === current()?.model ? "selected" : ""}" data-action="set-model" data-value="${name}"><span>${name}</span>${name === current()?.model ? icon("check") : ""}</button>`).join("")}`).join("")}</div>`,
        true,
      )
    if (action === "agents")
      return options("Agente", ["Build", "Plan", "Review"], current()?.agent || "Build", "set-agent")
    if (action === "effort")
      return options("Esforço de raciocínio", ["Baixo", "Médio", "Alto", "Máximo"], current()?.effort, "set-effort")
    if (action === "set-model" || action === "set-effort" || action === "set-agent") {
      if (!current()) newSession()
      current()[{ "set-model": "model", "set-effort": "effort", "set-agent": "agent" }[action]] = value
      dialog.close()
      return render()
    }
    if (action === "attach") return attachment.click()
    if (action === "remove-attachment") {
      const file = state.attachments.splice(Number(id), 1)[0]
      if (file?.url) URL.revokeObjectURL(file.url)
      return render()
    }
    if (action === "preview-attachment") {
      const file = state.attachments[Number(id)]
      return showDialog(
        esc(file.name),
        `<img class="attachment-preview" src="${file.url}" alt="Prévia de ${esc(file.name)}">`,
      )
    }
    if (action === "send") return send()
    if (action === "stop") {
      const entry = current()
      clearTimeout(timers.get(entry.id))
      timers.delete(entry.id)
      entry.running = false
      entry.messages ||= []
      entry.messages.push({ role: "assistant", text: "Resposta interrompida." })
      return render()
    }
    if (["mcps", "skills", "plugins"].includes(action)) return collection(action)
    if (action === "toggle-collection") {
      const list = value === "mcps" ? state.mcp : state[value]
      list[Number(id)] = !list[Number(id)]
      return collection(value)
    }
    if (action === "search")
      return showDialog(
        "Buscar conversas",
        `<input class="dialog-input" id="search-input" placeholder="Buscar por título" aria-label="Buscar por título"><div class="dialog-list">${state.sessions.map((entry) => `<button class="dialog-option" data-search="${esc(entry.title.toLocaleLowerCase())}" data-action="search-open" data-id="${entry.id}"><span>${esc(entry.title)}</span><small>${esc(project(entry.project)?.name)}</small></button>`).join("")}</div>`,
      )
    if (action === "search-open") {
      dialog.close()
      return openSession(id)
    }
    if (action === "project-add" || action === "tree-new")
      return showDialog(
        action === "project-add" ? "Adicionar projeto" : "Nova worktree",
        `<p>Crie um item de demonstração para explorar a navegação.</p><input class="dialog-input" id="new-name" placeholder="Nome" aria-label="Nome"><div class="dialog-actions"><button class="primary" data-action="create-item" data-value="${action}" data-id="${esc(id || "")}">Criar</button></div>`,
      )
    if (action === "create-item") {
      const name = dialog.querySelector("#new-name").value.trim()
      if (!name) {
        dialog.querySelector("#new-name").focus()
        return
      }
      const key = `item-${Date.now()}`
      if (value === "project-add")
        state.projects.push({ id: key, name, open: true, trees: [{ id: `${key}-main`, name: "main", sessions: [] }] })
      else project(id).trees.push({ id: key, name, sessions: [] })
      dialog.close()
      return render()
    }
    if (action === "permissions")
      return showDialog(
        "Permissões",
        `<p>Esta é uma demonstração local. Nenhum comando é executado e nenhuma permissão do sistema é alterada.</p><button class="primary" data-action="dialog-close">Entendi</button>`,
      )
    if (action === "about")
      return showDialog(
        "Meu workspace",
        `<p>Os projetos e conversas apresentados são exemplos. Esta interface não está conectada aos seus arquivos ou serviços.</p><button class="primary" data-action="dialog-close">Fechar</button>`,
      )
  })
  render()
})()
