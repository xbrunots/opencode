import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowUpRight01Icon,
  Cancel01Icon,
  File01Icon,
  Folder01Icon,
  GitBranchIcon,
  Layers01Icon,
  Link01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/button/components/button"
import { getConversationResources } from "@/features/conversation-resources"
import { ModelLogo } from "@/features/chat"
import type { ChatSession } from "@/features/chat"
import type { ToolKind } from "@/features/tool-panel"

export function ConversationContext({
  session,
  project,
  onOpenTool,
  onClose,
}: {
  session: ChatSession & { branch: string }
  project: string
  onOpenTool: (tool: ToolKind) => void
  onClose: () => void
}) {
  const resources = getConversationResources(session.id, session.busy)
  const changes = session.messages.some((message) => message.review)
  return (
    <aside className="conversation-context" aria-label="Contexto da conversa">
      <header className="context-heading">
        <div>
          <strong>{project}</strong>
          <span>
            <HugeiconsIcon icon={GitBranchIcon} size={11} />
            {session.branch}
          </span>
        </div>
        <Button variant="ghost" size="icon-xs" aria-label="Ocultar resumo da conversa" onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} size={14} />
        </Button>
      </header>
      <div className="context-sections">
        <Button variant="ghost" className="context-change-row" onClick={() => onOpenTool("changes")}>
          <HugeiconsIcon icon={File01Icon} size={16} />
          <span>Alterações</span>
          {changes ? (
            <span className="context-diff">
              <span className="diff-add">+148</span>
              <span className="diff-remove">−32</span>
            </span>
          ) : (
            <small>Sem alterações</small>
          )}
        </Button>
        <section>
          <button className="context-section-title" onClick={() => onOpenTool("agents")}>
            <HugeiconsIcon icon={UserGroupIcon} size={14} />
            <span>Subagentes</span>
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} />
          </button>
          <button className="context-agent-row" onClick={() => onOpenTool("agents")}>
            <span className="context-agent-logos">
              {resources.agents.map((agent) => (
                <ModelLogo key={agent.id} model={agent.model} />
              ))}
            </span>
            <span>
              {resources.agents.filter((agent) => agent.status === "running").length ||
                resources.agents.filter((agent) => agent.status === "completed").length}{" "}
              {resources.agents.some((agent) => agent.status === "running") ? "em andamento" : "concluídos"}
            </span>
          </button>
        </section>
        <section>
          <button className="context-section-title" onClick={() => onOpenTool("sources")}>
            <HugeiconsIcon icon={Folder01Icon} size={14} />
            <span>Fontes</span>
            <small>{resources.sources.length}</small>
          </button>
          {resources.sources.length ? (
            resources.sources.slice(0, 3).map((source) => (
              <button className="context-source-row" key={source.id} onClick={() => onOpenTool("sources")}>
                <HugeiconsIcon icon={source.url ? Link01Icon : File01Icon} size={14} />
                <span>{source.name}</span>
              </button>
            ))
          ) : (
            <p className="context-empty">Nenhuma fonte nesta conversa</p>
          )}
        </section>
        <section>
          <button className="context-section-title" onClick={() => onOpenTool("artifacts")}>
            <HugeiconsIcon icon={File01Icon} size={14} />
            <span>Artefatos</span>
            <small>{resources.artifacts.length}</small>
          </button>
          {resources.artifacts.length ? (
            resources.artifacts.map((artifact) => (
              <button className="context-source-row" key={artifact.id} onClick={() => onOpenTool("artifacts")}>
                <HugeiconsIcon icon={File01Icon} size={14} />
                <span>{artifact.name}</span>
              </button>
            ))
          ) : (
            <p className="context-empty">Nenhum artefato gerado</p>
          )}
        </section>
        <section>
          <button className="context-section-title" onClick={() => onOpenTool("mcps")}>
            <HugeiconsIcon icon={Link01Icon} size={14} />
            <span>MCPs da conversa</span>
            <small>{resources.mcps.length}</small>
          </button>
          <button className="context-resource-names" onClick={() => onOpenTool("mcps")}>
            {resources.mcps.map((mcp) => mcp.name).join(" · ") || "Nenhum MCP conectado"}
          </button>
        </section>
        <section>
          <button className="context-section-title" onClick={() => onOpenTool("skills")}>
            <HugeiconsIcon icon={Layers01Icon} size={14} />
            <span>Skills da conversa</span>
            <small>{resources.skills.length}</small>
          </button>
          <button className="context-resource-names" onClick={() => onOpenTool("skills")}>
            {resources.skills.map((skill) => skill.name).join(" · ") || "Nenhuma skill adicionada"}
          </button>
        </section>
      </div>
      <footer>Contexto demonstrativo desta conversa</footer>
    </aside>
  )
}
