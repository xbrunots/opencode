import { describe, expect, test } from "bun:test"
import { transitionDictation } from "./dictation-machine"
import { transitionDictationTransport } from "./dictation-transport-machine"
import { dictationPCM, dictationFloat } from "./dictation-audio"

describe("composer dictation", () => {
  test("sends final results once after recognition ends, excluding interim text", () => {
    const started = transitionDictation({ status: "idle" }, { type: "start" })
    const ready = transitionDictation(started.state, { type: "started" })
    const listening = transitionDictation(ready.state, {
      type: "results",
      final: ["Corrija o layout", "do compositor."],
      interim: "e talvez",
    })
    expect(listening.transcript).toBeUndefined()
    const stopped = transitionDictation(listening.state, { type: "stop" })
    expect(stopped.transcript).toBeUndefined()
    const ended = transitionDictation(stopped.state, { type: "end" })
    expect(ended.transcript).toBe("Corrija o layout do compositor.")
    expect(transitionDictation(ended.state, { type: "end" }).transcript).toBeUndefined()
  })

  test("accepts a final result delivered after stop but before end", () => {
    const stopped = transitionDictation({ status: "listening", final: [], interim: "Teste" }, { type: "stop" })
    const final = transitionDictation(stopped.state, { type: "results", final: ["Teste."], interim: "" })
    expect(transitionDictation(final.state, { type: "end" }).transcript).toBe("Teste.")
  })

  test("permission failures and disposal never auto-send accumulated speech", () => {
    const listening = { status: "listening" as const, final: ["Não envie"], interim: "" }
    const failed = transitionDictation(listening, { type: "failed" })
    expect(transitionDictation(failed.state, { type: "end" }).transcript).toBeUndefined()
    const disposed = transitionDictation(listening, { type: "disposed" })
    expect(transitionDictation(disposed.state, { type: "end" }).transcript).toBeUndefined()
    expect(transitionDictation(disposed.state, { type: "start" }).state.status).toBe("disposed")
  })

  test("silence and interim-only recognition leave the draft untouched", () => {
    expect(
      transitionDictation({ status: "listening", final: [], interim: "incompleto" }, { type: "end" }).transcript,
    ).toBeUndefined()
  })

  test("cancelling a microphone permission prompt ignores a late start and end", () => {
    const starting = transitionDictation({ status: "idle" }, { type: "start" })
    const cancelled = transitionDictation(starting.state, { type: "cancel" })
    expect(transitionDictation(cancelled.state, { type: "started" }).state.status).toBe("idle")
    expect(transitionDictation(cancelled.state, { type: "end" }).transcript).toBeUndefined()
  })
})

describe("offline dictation transport", () => {
  test("speech end flushes the final audio, drains recognition work, and only then sends the final transcript", () => {
    const ready = transitionDictationTransport({ status: "starting" }, { type: "ready" })
    const speech = transitionDictationTransport(ready.state, { type: "audio", samples: 1600, level: 0.1 })
    const silent = transitionDictationTransport(speech.state, { type: "audio", samples: 14_400, level: 0 })
    expect(silent.effects).toEqual([{ type: "flush" }])
    expect(transitionDictationTransport(silent.state, { type: "final", text: "Too early" }).effects).toEqual([])
    const flushed = transitionDictationTransport(silent.state, { type: "flushed" })
    expect(flushed.effects).toEqual([{ type: "drain" }])
    const drained = transitionDictationTransport(flushed.state, { type: "drained" })
    expect(drained.effects).toEqual([{ type: "finalize" }])
    const final = transitionDictationTransport(drained.state, { type: "final", text: " bom dia tudo bem " })
    expect(final.effects).toEqual([{ type: "release" }, { type: "complete", text: "bom dia tudo bem" }])
    expect(transitionDictationTransport(final.state, { type: "final", text: "Duplicate" }).effects).toEqual([])
  })

  test("manual stop uses the same finalization boundary without a recording duration quota", () => {
    const long = transitionDictationTransport(
      { status: "listening", samples: 0, speech: 0, silence: 0 },
      { type: "audio", samples: 9_600_000, level: 0.1 },
    )
    expect(long.state.status).toBe("listening")
    expect(long.effects).toEqual([])
    expect(transitionDictationTransport(long.state, { type: "stop" }).effects).toEqual([{ type: "flush" }])
  })

  test("cancel, missing local model and silence release resources without sending a draft", () => {
    const cancelled = transitionDictationTransport({ status: "flushing" }, { type: "cancel" })
    expect(cancelled.effects).toEqual([{ type: "release" }])
    expect(transitionDictationTransport(cancelled.state, { type: "flushed" }).effects).toEqual([])
    const failed = transitionDictationTransport({ status: "starting" }, { type: "failed", reason: "model" })
    expect(failed.effects).toEqual([{ type: "release" }, { type: "failed", reason: "model" }])
    expect(
      transitionDictationTransport(
        { status: "listening", samples: 0, speech: 0, silence: 0 },
        { type: "audio", samples: 160_000, level: 0 },
      ).effects,
    ).toEqual([{ type: "release" }, { type: "failed", reason: "empty" }])
  })

  test("PCM frames preserve mono little-endian samples and actual RMS for local recognition", () => {
    const frame = dictationPCM(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]))
    const view = new DataView(frame.buffer)
    expect(Array.from({ length: 7 }, (_, index) => view.getInt16(index * 2, true))).toEqual([
      -32768, -32768, -16384, 0, 16383, 32767, 32767,
    ])
    expect(Array.from(dictationFloat(frame.buffer))).toEqual([
      -1,
      -1,
      -0.5,
      0,
      16383 / 32768,
      32767 / 32768,
      32767 / 32768,
    ])
    expect(dictationPCM(new Float32Array([-1, 1])).level).toBe(1)
    expect(dictationPCM(new Float32Array(1600)).level).toBe(0)
  })
})
