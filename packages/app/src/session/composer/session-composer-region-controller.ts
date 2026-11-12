import type { Accessor } from "solid-js"
import type { SessionRequestModel } from "../requests/model"

/** Only the direct worker created for an extension setup can be continued from its own chat. */
export function interactiveExtensionChild(info: {
  parentID?: string
  metadata?: Readonly<Record<string, unknown>>
} | undefined) {
  const flow = info?.metadata?.opencodexExtensionFlow
  return !!info?.parentID && info.parentID === info.metadata?.opencodexExtensionRoot &&
    (flow === "mcp" || flow === "plugin" || flow === "skill")
}

export function createSessionComposerRegionController(input: {
  state: SessionRequestModel
  parentID: Accessor<string | undefined>
  centered: Accessor<boolean>
  onResponseSubmit: () => void
  openParent: () => void
  focusPrompt: () => void
  setPromptRef: (el: HTMLDivElement) => void
  setDockRef: (el: HTMLDivElement) => void
}) {
  return {
    state: input.state,
    centered: input.centered,
    onResponseSubmit: input.onResponseSubmit,
    openParent: input.openParent,
    focusPrompt: input.focusPrompt,
    setPromptRef: input.setPromptRef,
    setDockRef: input.setDockRef,
    parentID: input.parentID,
    child: () => !!input.parentID(),
    showComposer: () => !input.state.blocked() || !!input.parentID(),
  }
}

export type SessionComposerRegionController = ReturnType<typeof createSessionComposerRegionController>
