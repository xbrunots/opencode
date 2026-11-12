import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js"
import { useI18n } from "@opencode/ui/context/i18n"
import { MorphLoader } from "@opencode/ui/morph-loader"
import { ProviderIcon } from "@opencode/ui/provider-icon"
import { useData } from "../context"
import type { ToolProps } from "./tool-renderer"
import "./image-generation.css"

/** beUI-inspired image generation card, backed by the actual image job. */
export function ImageGenerationTool(props: ToolProps) {
  const data = useData()
  const i18n = useI18n()
  const pt = () => i18n.locale().toLowerCase().startsWith("pt")
  const prompt = () => (typeof props.input.prompt === "string" ? props.input.prompt : "")
  const jobID = () => (typeof props.metadata.jobID === "string" ? props.metadata.jobID : undefined)
  const model = () => (typeof props.metadata.model === "string" ? props.metadata.model : undefined)
  const modelIdentity = () => {
    const ref = model()
    if (!ref) return undefined
    const separator = ref.indexOf("/")
    if (separator <= 0 || separator === ref.length - 1) return undefined
    return { providerID: ref.slice(0, separator), id: ref.slice(separator + 1).split("#", 1)[0]! }
  }
  const [tick, setTick] = createSignal(0)
  const [job] = createResource(
    () => {
      const id = jobID()
      const session = props.sessionID ?? data.sessionID
      if (!id || !session || !data.imageJob) return undefined
      return { id, session, tick: tick() }
    },
    ({ id, session }) => data.imageJob?.(session, id).catch(() => undefined),
  )
  const state = () => {
    const id = jobID()
    const session = props.sessionID ?? data.sessionID
    return (id && session ? data.imageJobStatus?.(session, id) : undefined) ?? job()
  }
  const active = () => props.status === "streaming" || props.status === "running" || state() === "running"
  createEffect(() => {
    if (state() !== "running") return
    const timer = setTimeout(() => setTick((value) => value + 1), 2000)
    onCleanup(() => clearTimeout(timer))
  })

  const label = () => {
    if (active()) return pt() ? "Gerando imagem" : "Generating image"
    if (state() === "error") return pt() ? "Falha ao gerar imagem" : "Image generation failed"
    if (state() === "cancelled") return pt() ? "Geração cancelada" : "Generation cancelled"
    if (state() === "completed") return pt() ? "Imagem gerada" : "Image generated"
    return pt() ? "Geração de imagem iniciada" : "Image generation started"
  }

  return (
    <div data-component="image-generation-tool" role="status" aria-label={label()}>
      <div data-slot="image-generation-preview" data-active={active() ? "" : undefined} aria-hidden="true">
        <div data-slot="image-generation-dots">
          <For each={Array.from({ length: 121 }, (_, index) => index)}>
            {(index) => <span style={{ "--dot-delay": `${(index % 11 + Math.floor(index / 11)) * -45}ms` }} />}
          </For>
        </div>
      </div>
      <div data-slot="image-generation-label">
        <Show when={active()}><MorphLoader width={12} height={12} /></Show>
        <strong>{label()}</strong>
      </div>
      <Show when={prompt()}><p data-slot="image-generation-prompt">{prompt()}</p></Show>
      <Show when={model()}>
        <p data-slot="image-generation-model" class="flex items-center gap-1.5">
          <Show when={modelIdentity()}>
            {(identity) =>
              data.modelIcon?.(identity(), "size-3.5 shrink-0") ?? (
                <ProviderIcon id={identity().providerID} class="size-3.5 shrink-0" aria-hidden="true" />
              )
            }
          </Show>
          <span>{model()}</span>
        </p>
      </Show>
    </div>
  )
}
