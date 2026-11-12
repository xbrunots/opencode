import { createSignal, Show } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { useData, useServer } from "@/runtime/server/current"
import { useLanguage } from "@/runtime/i18n/language"
import { showToast } from "@/shell/notifications/toast"
import { errorMessage } from "@/shell/layout/helpers"
import { useTabs } from "@/shell/tabs/tabs"
import { useWorkspaceViews } from "@/shell/workspace-views"
import { useSessionTargetFloating, useSessionTargetParams } from "@/session/target"

export function useSideChat() {
  const data = useData()
  const server = useServer()
  const params = useSessionTargetParams()
  const tabs = useTabs()
  const views = useWorkspaceViews()

  return async (reuse = false) => {
    const current = params.id ? data.session.get(params.id) : undefined

    if (!current) return

    if (reuse && views.reopenFloating(server.key, current.id)) return

    const created = data.session.create({ location: current.location, model: current.model, agent: current.agent })
    await created.request
    tabs.addSessionTab({ server: server.key, sessionId: created.id })
    views.openFloating(server.key, created.id, current.id)
  }
}

export function SideChatButton() {
  const language = useLanguage()
  const open = useSideChat()
  const views = useWorkspaceViews()
  const floating = useSessionTargetFloating()
  const [pending, setPending] = createSignal(false)

  return (
    <Show when={!floating}>
      <Tooltip value={language.t("conversation.actions.openSideChat")} placement="bottom">
        <IconButton
          aria-label={language.t("conversation.actions.openSideChat")}
          icon={<Icon name="comment" />}
          variant="ghost-muted"
          size="large"
          disabled={pending() || !views.sideChatsReady()}
          onClick={() => {
            if (pending()) return
            setPending(true)
            void open(true)
              .catch((error) => showToast({
                title: language.t("common.requestFailed"),
                description: errorMessage(error, language.t("common.requestFailed")),
              }))
              .finally(() => setPending(false))
          }}
        />
      </Tooltip>
    </Show>
  )
}
