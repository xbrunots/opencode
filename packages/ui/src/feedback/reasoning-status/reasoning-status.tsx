import { Show } from "solid-js"
import { MorphLoader } from "../morph-loader/morph-loader"
import "./reasoning-status.css"

/** A compact status using beUI's Swap motion with the shared Morph indicator. */
export function ReasoningStatus(props: { text: string }) {
  return (
    <span data-component="reasoning-status">
      <MorphLoader width={12} height={12} />
      <span data-slot="reasoning-status-clip">
        <Show when={props.text} keyed>
          {(text) => <span data-slot="reasoning-status-text">{text}</span>}
        </Show>
      </span>
    </span>
  )
}
