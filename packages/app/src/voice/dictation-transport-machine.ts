export type DictationFailure = "unsupported" | "microphone" | "unavailable" | "failed" | "empty"

export type DictationTransportState =
  | { status: "starting" }
  | { status: "listening"; samples: number; speech: number; silence: number }
  | { status: "flushing" }
  | { status: "stopping"; itemID?: string; pending?: { itemID: string; text: string } }
  | { status: "closed" }

export type DictationTransportEvent =
  | { type: "ready" }
  | { type: "audio"; samples: number; level: number }
  | { type: "stop" }
  | { type: "flushed" }
  | { type: "committed"; itemID: string }
  | { type: "transcript"; itemID: string; text: string }
  | { type: "failed"; reason: DictationFailure }
  | { type: "cancel" }

export type DictationTransportEffect =
  | { type: "started" }
  | { type: "flush" }
  | { type: "commit" }
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
    if (next.speech === 0 && next.samples >= 240_000)
      return { state: { status: "closed" }, effects: [{ type: "release" }, { type: "failed", reason: "empty" }] }
    if ((next.speech >= 6000 && next.silence >= 21_600) || next.samples >= 2_880_000)
      return { state: { status: "flushing" }, effects: [{ type: "flush" }] }
    return { state: next, effects: [] }
  }
  if (event.type === "stop" && state.status === "listening") {
    if (state.samples < 2400)
      return { state: { status: "closed" }, effects: [{ type: "release" }, { type: "failed", reason: "empty" }] }
    return { state: { status: "flushing" }, effects: [{ type: "flush" }] }
  }
  if (event.type === "flushed" && state.status === "flushing")
    return { state: { status: "stopping" }, effects: [{ type: "commit" }] }
  if (event.type === "committed" && state.status === "stopping") {
    if (state.pending?.itemID === event.itemID) return complete(state.pending.text)
    return { state: { status: "stopping", itemID: event.itemID }, effects: [] }
  }
  if (event.type === "transcript" && state.status === "stopping") {
    if (state.itemID === event.itemID) return complete(event.text)
    if (!state.itemID) return { state: { ...state, pending: { itemID: event.itemID, text: event.text } }, effects: [] }
  }
  return { state, effects: [] }
}

function complete(text: string): { state: DictationTransportState; effects: readonly DictationTransportEffect[] } {
  return {
    state: { status: "closed" },
    effects: [
      { type: "release" },
      text.trim() ? { type: "complete", text: text.trim() } : { type: "failed", reason: "empty" },
    ],
  }
}
