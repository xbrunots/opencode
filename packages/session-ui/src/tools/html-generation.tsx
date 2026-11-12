import { For } from "solid-js"
import { useI18n } from "@opencode/ui/context/i18n"
import { MorphLoader } from "@opencode/ui/morph-loader"
import { getFilename } from "@opencode/util/path"
import "./html-generation.css"

/** A live activity indicator, not a percentage or a preview of uncommitted content. */
export function HtmlGenerationCard(props: { path: string }) {
  const i18n = useI18n()
  return (
    <div data-component="html-generation" role="status" aria-label={i18n.t("ui.htmlGeneration.working")}>
      <div data-slot="html-generation-preview" aria-hidden="true">
        <span data-slot="html-generation-format">HTML</span>
        <div data-slot="html-generation-dots">
          <For each={Array.from({ length: 49 }, (_, index) => index)}>
            {(index) => <span style={{ "--html-dot-delay": `${(index % 7 + Math.floor(index / 7)) * -90}ms` }} />}
          </For>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m8 8-4 4 4 4m8-8 4 4-4 4m-2-11-4 14" /></svg>
      </div>
      <div data-slot="html-generation-label"><MorphLoader width={12} height={12} /><strong>{i18n.t("ui.htmlGeneration.working")}</strong></div>
      <p title={props.path}>{getFilename(props.path)}</p>
    </div>
  )
}
