export function getConversationResources(sessionId: string, busy: boolean) {
  const existing = ["workspace", "review", "tests", "auth", "tokens"].includes(sessionId)
  const design = sessionId === "workspace" || sessionId === "tokens"
  return {
    agents: existing
      ? [
          {
            id: "interface",
            name: design ? "Interface e componentes" : "Revisão da implementação",
            description: design ? "Composição do workspace e componentes Notra" : "Análise dos fluxos desta conversa",
            status: busy ? ("running" as const) : ("completed" as const),
            model: "gpt-codex",
          },
          {
            id: "validation",
            name: "Validação dos fluxos",
            description: "Navegação, estados e acessibilidade",
            status: "completed" as const,
            model: "claude-sonnet",
          },
        ]
      : [],
    sources: existing
      ? [
          {
            id: "thread",
            name: "Notra · ChatGPT Thread",
            description: "Componentes de conversa",
            url: "https://ui.usenotra.com/components/chatgpt/thread",
          },
          {
            id: "registry",
            name: "Notra UI",
            description: "Biblioteca de componentes",
            url: "https://ui.usenotra.com/",
          },
          { id: "chat-source", name: "chat.tsx", description: "src/features · arquivo do projeto" },
        ]
      : [],
    artifacts: design
      ? [
          {
            id: "workspace-notes",
            name: "Direção do workspace.md",
            description: "Decisões de interface desta conversa",
            content:
              "# OpenCodex × Notra\n\nProjetos contêm worktrees. Cada worktree organiza suas conversas.\n\n- Chat com superfícies sólidas\n- Menus e diálogos com glass e blur\n- Ferramentas abertas em abas no painel lateral\n- Contexto da conversa acessível no topo\n\nArtefato demonstrativo do protótipo local.",
          },
        ]
      : [],
    mcps: existing
      ? [
          { id: "github", name: "GitHub", description: "Repositórios, issues e pull requests", enabled: true },
          { id: "context7", name: "Context7", description: "Documentação de bibliotecas", enabled: true },
        ]
      : [],
    skills: existing
      ? [
          {
            id: "design",
            name: design ? "Interface design" : "Code review",
            description: design ? "Composição e estados de interface" : "Revisão das alterações",
            enabled: true,
          },
          {
            id: "testing",
            name: "Testes de interface",
            description: "Verificação dos fluxos de navegação",
            enabled: true,
          },
        ]
      : [],
  }
}
