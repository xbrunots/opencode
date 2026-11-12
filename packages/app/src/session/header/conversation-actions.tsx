import { createResource, For, Show } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { Keybind } from "@opencode/ui/keybind"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useData, useServer } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { useCommand } from "@/shell/commands/command"
import { useTabs } from "@/shell/tabs/tabs"
import { useWorkspaceViews } from "@/shell/workspace-views"
import { sessionHref } from "@/shell/routes/session"
import { errorMessage } from "@/shell/layout/helpers"
import { showToast } from "@/shell/notifications/toast"
import { useSessionTargetParams, useSessionTargetFocused } from "@/session/target"
import { createSessionExporter } from "@/session/commands/export-session"
import { fetchSessionExport, type SessionExportData } from "@/session/commands/export"

export function ConversationActions() {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const sdk = useServerSDK()
  const data = useData()
  const params = useSessionTargetParams()
  const focused = useSessionTargetFocused()
  const tabs = useTabs()
  const views = useWorkspaceViews()
  const command = useCommand()
  const exporter = createSessionExporter()
  const [editors] = createResource(async () => {
    const entries = [
      { label: "Visual Studio Code", command: platform.os === "windows" ? "code" : "Visual Studio Code" },
      { label: "Cursor", command: platform.os === "windows" ? "cursor" : "Cursor" },
    ]
    return (
      await Promise.all(
        entries.map(async (editor) => ((await platform.checkAppExists?.(editor.command)) ? editor : undefined)),
      )
    ).filter((editor) => editor !== undefined)
  })
  const info = () => (params.id ? data.session.get(params.id) : undefined)
  const pinned = () => info()?.metadata?.opencodexPinned === true
  const run = (action: () => unknown | Promise<unknown>) => {
    void Promise.try(action).catch((error) =>
      showToast({
        title: language.t("common.requestFailed"),
        description: errorMessage(error, language.t("common.requestFailed")),
      }),
    )
  }
  const copy = (text: string) =>
    platform.writeClipboardText ? platform.writeClipboardText(text) : navigator.clipboard.writeText(text)
  const markdown = (value: SessionExportData) =>
    [
      `# ${value.info.title ?? value.info.id}`,
      ...value.messages.flatMap((message) => {
        if (message.type === "user") return [`\n## ${language.t("conversation.actions.user")}\n\n${message.text}`]
        if (message.type === "assistant")
          return [
            `\n## ${language.t("conversation.actions.assistant")}\n\n${message.content.flatMap((content) => (content.type === "text" ? [content.text] : [])).join("\n\n")}`,
          ]
        return []
      }),
    ].join("\n")
  const copyConversation = async () => {
    const current = info()
    if (!current) return
    await copy(markdown(await fetchSessionExport({ sessionID: current.id, api: sdk.api })))
  }
  const pin = async () => {
    const current = info()
    if (!current) return
    tabs.keepPreview()
    await sdk.api.session.update({
      sessionID: current.id,
      metadata: { ...current.metadata, opencodexPinned: current.metadata?.opencodexPinned !== true },
    })
  }
  const sideChat = async () => {
    const current = info()
    if (!current) return
    const created = data.session.create({ location: current.location, model: current.model, agent: current.agent })
    await created.request
    const tab = tabs.addSessionTab({ server: server.key, sessionId: created.id })
    tabs.select(tab)
    views.setMode("grid")
  }
  const archive = async () => {
    const current = info()
    if (!current) return
    await sdk.api.session.update({ sessionID: current.id, archived: true })
    const index = tabs.store.findIndex(
      (tab) => tab.type === "session" && tab.server === server.key && tab.sessionId === current.id,
    )
    if (index >= 0) tabs.closeTab(index)
  }
  const openWindow = () => {
    const current = info()
    if (!current) return
    const route = sessionHref(server.key, current.id)
    if (platform.openSessionWindow) return platform.openSessionWindow(route)
    window.open(route, "_blank", "noopener,noreferrer")
  }
  const share = async () => {
    const current = info()
    if (!current) return
    if (typeof navigator.share === "function") {
      const text = markdown(await fetchSessionExport({ sessionID: current.id, api: sdk.api }))
      await navigator.share({ title: current.title, text })
      return
    }
    exporter.export({ server: server.key, sessionID: current.id })
  }
  command.register(() =>
    focused() && info()
      ? [
          {
            id: "conversation.pin",
            title: language.t(pinned() ? "conversation.actions.unpin" : "conversation.actions.pin"),
            category: language.t("command.category.session"),
            keybind: "mod+alt+p",
            onSelect: () => run(pin),
          },
          {
            id: "conversation.sideChat",
            title: language.t("conversation.actions.sideChat"),
            category: language.t("command.category.session"),
            keybind: "mod+alt+s",
            onSelect: () => run(sideChat),
          },
          {
            id: "conversation.archive",
            title: language.t("conversation.actions.archive"),
            category: language.t("command.category.session"),
            keybind: "mod+alt+a",
            onSelect: () => run(archive),
          },
        ]
      : [],
  )

  return (
    <Show when={focused() && info()}>
      <Menu placement="bottom-end" gutter={8} modal={false}>
        <Menu.Trigger
          as={IconButton}
          icon={<Icon name="outline-dots" />}
          variant="ghost-muted"
          size="large"
          aria-label={language.t("conversation.actions.title")}
          data-slot="conversation-actions-trigger"
        />
        <Menu.Portal>
          <Menu.Content data-slot="conversation-actions-menu" class="min-w-64">
            <Menu.Item onSelect={() => command.trigger("session.rename")}>
              <Icon name="edit" />
              <span class="flex-1">{language.t("common.rename")}</span>
              <Keybind keys={command.keybindParts("session.rename")} />
            </Menu.Item>
            <Menu.Item onSelect={() => run(pin)}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m10 2 4 4-2.5 1.5-1 4-2 2-6-6 2-2 4-1L10 2ZM8.5 10l-6 6" />
              </svg>
              <span class="flex-1">
                {language.t(pinned() ? "conversation.actions.unpin" : "conversation.actions.pin")}
              </span>
              <Keybind keys={command.keybindParts("conversation.pin")} />
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item onSelect={() => run(sideChat)}>
              <Icon name="plus" />
              <span class="flex-1">{language.t("conversation.actions.sideChat")}</span>
              <Keybind keys={command.keybindParts("conversation.sideChat")} />
            </Menu.Item>
            <Menu.Item onSelect={() => command.trigger("session.fork")}>
              <Icon name="branch-out" />
              {language.t("command.session.fork")}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item onSelect={() => run(share)}>
              <Icon name="outline-share" />
              {language.t("conversation.actions.share")}
            </Menu.Item>
            <Menu.Sub placement="right-start" gutter={4}>
              <Menu.SubTrigger>
                <Icon name="copy" />
                {language.t("conversation.actions.copy")}
              </Menu.SubTrigger>
              <Menu.Portal>
                <Menu.SubContent>
                  <Menu.Item onSelect={() => run(copyConversation)}>
                    {language.t("conversation.actions.copyConversation")}
                  </Menu.Item>
                  <Menu.Item onSelect={() => run(() => copy(info()?.id ?? ""))}>
                    {language.t("conversation.actions.copyId")}
                  </Menu.Item>
                  <Menu.Item onSelect={() => run(() => copy(info()?.location.directory ?? ""))}>
                    {language.t("conversation.actions.copyPath")}
                  </Menu.Item>
                </Menu.SubContent>
              </Menu.Portal>
            </Menu.Sub>
            <Menu.Separator />
            <Menu.Item onSelect={() => run(openWindow)}>
              <Icon name="monitor" />
              {language.t("conversation.actions.openWindow")}
            </Menu.Item>
            <Show when={platform.openPath}>
              <Menu.Sub placement="right-start" gutter={4}>
                <Menu.SubTrigger>
                  <Icon name="folder" />
                  {language.t("conversation.actions.openIn")}
                </Menu.SubTrigger>
                <Menu.Portal>
                  <Menu.SubContent>
                    <Menu.Item onSelect={() => run(() => platform.openPath?.(info()!.location.directory))}>
                      {language.t("conversation.actions.fileManager")}
                    </Menu.Item>
                    <For each={editors()}>
                      {(editor) => (
                        <Menu.Item
                          onSelect={() => run(() => platform.openPath?.(info()!.location.directory, editor.command))}
                        >
                          {editor.label}
                        </Menu.Item>
                      )}
                    </For>
                  </Menu.SubContent>
                </Menu.Portal>
              </Menu.Sub>
            </Show>
            <Menu.Separator />
            <Menu.Item onSelect={() => run(archive)}>
              <Icon name="archive" />
              <span class="flex-1">{language.t("conversation.actions.archive")}</span>
              <Keybind keys={command.keybindParts("conversation.archive")} />
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu>
    </Show>
  )
}
