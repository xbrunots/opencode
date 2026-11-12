import { getProjectAvatarVariant, type ProjectAvatarProps } from "@opencode/ui/project-avatar"
import { Icon } from "@opencode/ui/icon"
import { splitProps } from "solid-js"
import type { LocalProject } from "@/shell/state/layout"

type ProjectIconProps = Omit<ProjectAvatarProps, "fallback" | "src" | "variant"> & {
  project: Pick<LocalProject, "id" | "name" | "worktree" | "icon">
  fallback?: string
  icon?: LocalProject["icon"]
  open?: boolean
}

export function ProjectIcon(props: ProjectIconProps) {
  const [local, rest] = splitProps(props, ["project", "fallback", "icon", "class", "style", "open"])
  const color = () => (local.icon ?? local.project.icon)?.color
  return (
    <div
      {...rest}
      data-folder-state={local.open ? "open" : "closed"}
      class={`inline-flex size-4 shrink-0 items-center justify-center ${local.class ?? ""}`}
      style={{
        color: color() ? `var(--v2-avatar-border-${getProjectAvatarVariant(color())})` : "currentColor",
        ...(typeof local.style === "object" ? local.style : {}),
      }}
    >
      {local.open ? (
        <svg
          aria-hidden="true"
          class="size-full"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M2.5 14.5V4.5h5l2 2h7v2" />
          <path d="M2.5 14.5 5 8.5h13l-2.5 6H2.5Z" />
        </svg>
      ) : (
        <Icon name="folder" class="size-full" />
      )}
    </div>
  )
}
