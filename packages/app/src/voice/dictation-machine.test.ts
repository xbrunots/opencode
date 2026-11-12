import { describe, expect, test } from "bun:test"
import { transitionDictation } from "./dictation-machine"
import { transitionDictationTransport } from "./dictation-transport-machine"
import { dictationPCM } from "./dictation-audio"

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

describe("native dictation transport", () => {
  test("silence after speech flushes audio before committing and only the matching final item is sent", () => {
    const ready = transitionDictationTransport({ status: "starting" }, { type: "ready" })
    const speech = transitionDictationTransport(ready.state, { type: "audio", samples: 7200, level: 0.1 })
    const silent = transitionDictationTransport(speech.state, { type: "audio", samples: 21_600, level: 0 })
    expect(silent.effects).toEqual([{ type: "flush" }])
    const flushed = transitionDictationTransport(silent.state, { type: "flushed" })
    expect(flushed.effects).toEqual([{ type: "commit" }])
    const committed = transitionDictationTransport(flushed.state, { type: "committed", itemID: "recording-1" })
    const unrelated = transitionDictationTransport(committed.state, {
      type: "transcript",
      itemID: "another",
      text: "Ignore",
    })
    expect(unrelated.effects).toEqual([])
    const final = transitionDictationTransport(unrelated.state, {
      type: "transcript",
      itemID: "recording-1",
      text: " Corrija as abas. ",
    })
    expect(final.effects).toEqual([{ type: "release" }, { type: "complete", text: "Corrija as abas." }])
    expect(
      transitionDictationTransport(final.state, { type: "transcript", itemID: "recording-1", text: "Duplicate" })
        .effects,
    ).toEqual([])
  })

  test("manual stop accepts a final event before the commit acknowledgment without sending early", () => {
    const stopped = transitionDictationTransport(
      { status: "listening", samples: 4800, speech: 4800, silence: 0 },
      { type: "stop" },
    )
    const flushed = transitionDictationTransport(stopped.state, { type: "flushed" })
    const early = transitionDictationTransport(flushed.state, { type: "transcript", itemID: "one", text: "Hello" })
    expect(early.effects).toEqual([])
    expect(transitionDictationTransport(early.state, { type: "committed", itemID: "one" }).effects).toEqual([
      { type: "release" },
      { type: "complete", text: "Hello" },
    ])
  })

  test("cancel, unavailable microphone and silence release resources without completing a draft", () => {
    const cancelled = transitionDictationTransport({ status: "flushing" }, { type: "cancel" })
    expect(cancelled.effects).toEqual([{ type: "release" }])
    expect(transitionDictationTransport(cancelled.state, { type: "flushed" }).effects).toEqual([])
    const failed = transitionDictationTransport({ status: "starting" }, { type: "failed", reason: "microphone" })
    expect(failed.effects).toEqual([{ type: "release" }, { type: "failed", reason: "microphone" }])
    expect(
      transitionDictationTransport(
        { status: "listening", samples: 0, speech: 0, silence: 0 },
        { type: "audio", samples: 240_000, level: 0 },
      ).effects,
    ).toEqual([{ type: "release" }, { type: "failed", reason: "empty" }])
  })

  test("PCM frames are clipped mono little-endian 16-bit samples with the actual RMS level", () => {
    const frame = dictationPCM(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]))
    const view = new DataView(frame.buffer)
    expect(Array.from({ length: 7 }, (_, index) => view.getInt16(index * 2, true))).toEqual([
      -32768, -32768, -16384, 0, 16383, 32767, 32767,
    ])
    expect(dictationPCM(new Float32Array([-1, 1])).level).toBe(1)
    expect(dictationPCM(new Float32Array(2400)).level).toBe(0)
  })
})
