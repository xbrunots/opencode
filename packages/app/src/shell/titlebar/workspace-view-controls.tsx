import { For } from "solid-js"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { useLanguage } from "@/runtime/i18n/language"
import { useWorkspaceViews } from "@/shell/workspace-views"

const modes = ["focus", "grid", "islands"] as const

export function WorkspaceViewControls() {
  const views = useWorkspaceViews()
  const language = useLanguage()

  return (
    <div data-slot="workspace-view-controls" role="group" aria-label={language.t("workspace.view.label")}>
      <For each={modes}>
        {(mode) => (
          <Tooltip placement="bottom" value={language.t(`workspace.view.${mode}`)}>
            <IconButton
              type="button"
              variant="ghost-muted"
              size="normal"
              aria-label={language.t(`workspace.view.${mode}`)}
              aria-pressed={views.mode() === mode}
              state={views.mode() === mode ? "pressed" : undefined}
              onClick={() => views.setMode(mode)}
              icon={
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                  stroke="currentColor"
                  stroke-width="1.3"
                >
                  {mode === "focus" ? (
                    <rect x="3" y="3" width="14" height="14" rx="2" />
                  ) : mode === "grid" ? (
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
              }
            />
          </Tooltip>
        )}
      </For>
    </div>
  )
}
