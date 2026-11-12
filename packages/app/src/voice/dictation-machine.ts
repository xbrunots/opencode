export type DictationState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "listening"; final: readonly string[]; interim: string }
  | { status: "stopping"; final: readonly string[] }
  | { status: "failed" }
  | { status: "disposed" }

export type DictationEvent =
  | { type: "start" }
  | { type: "started" }
  | { type: "cancel" }
  | { type: "results"; final: readonly string[]; interim: string }
  | { type: "stop" }
  | { type: "end" }
  | { type: "failed" }
  | { type: "disposed" }

export function transitionDictation(
  state: DictationState,
  event: DictationEvent,
): {
  state: DictationState
  transcript?: string
} {
  if (state.status === "disposed") return { state }
  if (event.type === "disposed") return { state: { status: "disposed" } }
  if (event.type === "failed") return { state: { status: "failed" } }
  if (event.type === "cancel") return { state: { status: "idle" } }
  if (event.type === "start") {
    if (state.status === "starting" || state.status === "listening" || state.status === "stopping") return { state }
    return { state: { status: "starting" } }
  }
  if (event.type === "started")
    return state.status === "starting" ? { state: { status: "listening", final: [], interim: "" } } : { state }
  if (state.status !== "listening" && state.status !== "stopping") return { state }
  if (event.type === "results") {
    if (state.status === "listening")
      return { state: { status: "listening", final: event.final, interim: event.interim } }
    return { state: { status: "stopping", final: event.final } }
  }
  if (event.type === "stop") return { state: { status: "stopping", final: state.final } }
  if (event.type === "end") return { state: { status: "idle" }, transcript: state.final.join(" ").trim() || undefined }
  return { state }
}
