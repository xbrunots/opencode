import { For } from "solid-js"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { useLanguage } from "@/runtime/i18n/language"
import { useWorkspaceViews } from "@/shell/workspace-views"

const modes = ["focus", "grid", "islands"] as const

export function WorkspaceViewControls() {
  const views = useWorkspaceViews()
  const language = useLanguage()

  return (
    <div data-slot="workspace-view-controls">
      <Menu placement="bottom-end" gutter={6} modal={false}>
        <Menu.Trigger
          as={IconButton}
          type="button"
          variant="ghost-muted"
          size="normal"
          aria-label={language.t("workspace.view.label")}
          icon={<ViewIcon mode={views.mode()} />}
        />
        <Menu.Portal>
          <Menu.Content class="min-w-44">
            <Menu.RadioGroup
              value={views.mode()}
              onChange={(value) => {
                const mode = modes.find((item) => item === value)
                if (mode) views.setMode(mode)
              }}
            >
              <For each={modes}>
                {(mode) => (
                  <Menu.RadioItem value={mode}>
                    <ViewIcon mode={mode} />
                    <span>{language.t(`workspace.view.${mode}`)}</span>
                  </Menu.RadioItem>
                )}
              </For>
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu.Portal>
      </Menu>
    </div>
  )
}

function ViewIcon(props: { mode: (typeof modes)[number] }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      stroke-width="1.3"
    >
      {props.mode === "focus" ? (
        <rect x="3" y="3" width="14" height="14" rx="2" />
      ) : props.mode === "grid" ? (
        <>
          <rect x="3" y="3" width="14" height="14" rx="2" />
          <path d="M10 3v14M3 10h14" />
        </>
      ) : (
        <>
          <rect x="2" y="2.5" width="11" height="11" rx="2" />
          <path d="M7 16h8.5a2 2 0 0 0 2-2V7" />
        </>
      )}
    </svg>
  )
}
