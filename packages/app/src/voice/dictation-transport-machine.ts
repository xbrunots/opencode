export type DictationFailure = "unsupported" | "microphone" | "model" | "failed" | "empty"

export type DictationTransportState =
  | { status: "starting" }
  | { status: "listening"; samples: number; speech: number; silence: number }
  | { status: "flushing" }
  | { status: "draining" }
  | { status: "finishing" }
  | { status: "closed" }

export type DictationTransportEvent =
  | { type: "ready" }
  | { type: "audio"; samples: number; level: number }
  | { type: "stop" }
  | { type: "flushed" }
  | { type: "drained" }
  | { type: "final"; text: string }
  | { type: "failed"; reason: DictationFailure }
  | { type: "cancel" }

export type DictationTransportEffect =
  | { type: "started" }
  | { type: "flush" }
  | { type: "drain" }
  | { type: "finalize" }
  | { type: "complete"; text: string }
  | { type: "failed"; reason: DictationFailure }
  | { type: "release" }

export function transitionDictationTransport(
  state: DictationTransportState,
  event: DictationTransportEvent,
): {
  state: DictationTransportState
  effects: readonly DictationTransportEffect[]
} {
  if (state.status === "closed") return { state, effects: [] }
  if (event.type === "cancel") return { state: { status: "closed" }, effects: [{ type: "release" }] }
  if (event.type === "failed")
    return { state: { status: "closed" }, effects: [{ type: "release" }, { type: "failed", reason: event.reason }] }
  if (event.type === "ready" && state.status === "starting")
    return { state: { status: "listening", samples: 0, speech: 0, silence: 0 }, effects: [{ type: "started" }] }
  if (event.type === "audio" && state.status === "listening") {
    const next = {
      status: "listening" as const,
      samples: state.samples + event.samples,
      speech: state.speech + (event.level >= 0.012 ? event.samples : 0),
      silence: event.level >= 0.012 ? 0 : state.silence + event.samples,
    }
    if (next.speech === 0 && next.samples >= 160_000)
      return { state: { status: "closed" }, effects: [{ type: "release" }, { type: "failed", reason: "empty" }] }
    if (next.speech >= 1600 && next.silence >= 14_400)
      return { state: { status: "flushing" }, effects: [{ type: "flush" }] }
    return { state: next, effects: [] }
  }
  if (event.type === "stop" && state.status === "listening") {
    if (state.samples < 1600)
      return { state: { status: "closed" }, effects: [{ type: "release" }, { type: "failed", reason: "empty" }] }
    return { state: { status: "flushing" }, effects: [{ type: "flush" }] }
  }
  if (event.type === "flushed" && state.status === "flushing")
    return { state: { status: "draining" }, effects: [{ type: "drain" }] }
  if (event.type === "drained" && state.status === "draining")
    return { state: { status: "finishing" }, effects: [{ type: "finalize" }] }
  if (event.type === "final" && state.status === "finishing")
    return {
      state: { status: "closed" },
      effects: [
        { type: "release" },
        event.text.trim() ? { type: "complete", text: event.text.trim() } : { type: "failed", reason: "empty" },
      ],
    }
  return { state, effects: [] }
}
