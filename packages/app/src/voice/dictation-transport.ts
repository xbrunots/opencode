import type { OpenCodeClient } from "@opencode/client/promise"
import { Option, Schema } from "effect"
import type { Platform } from "@/runtime/platform/platform"
import workletURL from "./dictation-worklet?worker&url"
import type { DictationWorkletEvent } from "./dictation-audio"
import {
  transitionDictationTransport,
  type DictationFailure,
  type DictationTransportEvent,
  type DictationTransportState,
} from "./dictation-transport-machine"

export type DictationBackend = {
  voice: () => OpenCodeClient["experimental"]["voice"]
  platform: Pick<Platform, "platform" | "requestMicrophone">
}

const decode = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      type: Schema.String,
      item_id: Schema.optional(Schema.String),
      transcript: Schema.optional(Schema.String),
    }),
  ),
)

/** A dedicated transcription session; it never creates assistant responses or delegates tools. */
export class DictationTransport {
  private state: DictationTransportState = { status: "starting" }
  private abort = new AbortController()
  private socket?: WebSocket
  private stream?: MediaStream
  private context?: AudioContext
  private source?: MediaStreamAudioSourceNode
  private processor?: AudioWorkletNode
  private sink?: GainNode
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    private input: DictationBackend & {
      language: string
      started: () => void
      stopped: () => void
      complete: (text: string) => void
      failed: (reason: DictationFailure) => void
    },
  ) {}

  start() {
    this.timer = setTimeout(() => this.dispatch({ type: "failed", reason: "failed" }), 30_000)
    void this.prepare().catch((error: unknown) => {
      if (this.state.status === "closed") return
      this.dispatch({ type: "failed", reason: error instanceof DictationError ? error.reason : "failed" })
    })
  }

  stop() {
    if (this.state.status === "starting") return this.close()
    this.dispatch({ type: "stop" })
  }

  close() {
    this.dispatch({ type: "cancel" })
  }

  private dispatch(event: DictationTransportEvent) {
    const next = transitionDictationTransport(this.state, event)
    this.state = next.state
    next.effects.forEach((effect) => {
      if (effect.type === "release") return this.release()
      if (effect.type === "failed") return this.input.failed(effect.reason)
      if (effect.type === "complete") return this.input.complete(effect.text)
      if (effect.type === "started") {
        clearTimeout(this.timer)
        this.input.started()
        return
      }
      if (effect.type === "flush") {
        this.input.stopped()
        this.processor?.port.postMessage({ type: "flush" })
        this.timer = setTimeout(() => this.dispatch({ type: "failed", reason: "failed" }), 2_000)
        return
      }
      clearTimeout(this.timer)
      this.releaseCapture()
      this.socket?.send(JSON.stringify({ type: "input_audio_buffer.commit" }))
      this.timer = setTimeout(() => this.dispatch({ type: "failed", reason: "failed" }), 20_000)
    })
  }

  private async prepare() {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) throw new DictationError("unsupported")
    const context = new AudioContext({ sampleRate: 24_000 })
    this.context = context
    await context.resume()
    const voice = this.input.voice()
    const models = await voice.models({ signal: this.abort.signal })
    if (
      !models.models.some(
        (model) => model.model === "gpt-live-transcribe" && model.available && model.transports.includes("websocket"),
      )
    )
      throw new DictationError("unavailable")
    if (this.input.platform.requestMicrophone && !(await this.input.platform.requestMicrophone()))
      throw new DictationError("microphone")
    this.abort.signal.throwIfAborted()
    const stream = await navigator.mediaDevices
      .getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      })
      .catch(() => undefined)
    if (!stream) throw new DictationError("microphone")
    if (this.state.status === "closed") {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    this.stream = stream
    if (!context.audioWorklet || context.sampleRate !== 24_000) throw new DictationError("unsupported")
    await context.audioWorklet.addModule(workletURL)
    this.abort.signal.throwIfAborted()
    const session = {
      type: "transcription",
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24_000 },
          transcription: { model: "gpt-live-transcribe", languages: [this.input.language.split("-")[0]] },
          turn_detection: null,
        },
      },
    }
    const response = await voice.session(
      { model: "gpt-live-transcribe", session, transport: { type: "websocket" } },
      { signal: this.abort.signal },
    )
    this.abort.signal.throwIfAborted()
    if (response.transport.type !== "websocket") throw new DictationError("failed")
    const socket = new WebSocket(response.transport.url, [
      "realtime",
      `openai-insecure-api-key.${response.transport.token}`,
    ])
    this.socket = socket
    socket.onopen = () => socket.send(JSON.stringify({ type: "session.update", session }))
    socket.onerror = () => this.dispatch({ type: "failed", reason: "failed" })
    socket.onclose = () => this.dispatch({ type: "failed", reason: "failed" })
    socket.onmessage = (message: MessageEvent<string>) => {
      const event = Option.getOrUndefined(decode(message.data))
      if (!event) return
      if (event.type === "error" || event.type === "conversation.item.input_audio_transcription.failed")
        return this.dispatch({ type: "failed", reason: "failed" })
      if (event.type === "session.updated" && this.state.status === "starting") {
        try {
          this.capture()
        } catch {
          this.dispatch({ type: "failed", reason: "failed" })
        }
        return
      }
      if (event.type === "input_audio_buffer.committed" && event.item_id)
        return this.dispatch({ type: "committed", itemID: event.item_id })
      if (
        event.type === "conversation.item.input_audio_transcription.completed" &&
        event.item_id &&
        event.transcript !== undefined
      )
        this.dispatch({ type: "transcript", itemID: event.item_id, text: event.transcript })
    }
  }

  private capture() {
    if (!this.context || !this.stream || !this.socket) return
    const socket = this.socket
    this.source = this.context.createMediaStreamSource(this.stream)
    this.processor = new AudioWorkletNode(this.context, "opencode-dictation", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: "explicit",
    })
    this.sink = this.context.createGain()
    this.sink.gain.value = 0
    this.source.connect(this.processor)
    this.processor.connect(this.sink)
    this.sink.connect(this.context.destination)
    this.processor.onprocessorerror = () => this.dispatch({ type: "failed", reason: "failed" })
    this.processor.port.onmessage = (message: MessageEvent<DictationWorkletEvent>) => {
      if (message.data.type === "flushed") return this.dispatch({ type: "flushed" })
      if (
        (this.state.status !== "listening" && this.state.status !== "flushing") ||
        socket.readyState !== WebSocket.OPEN
      )
        return
      const bytes = new Uint8Array(message.data.buffer)
      socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio: btoa(String.fromCharCode(...bytes)) }))
      this.dispatch({ type: "audio", samples: bytes.length / 2, level: message.data.level })
    }
    this.stream.getAudioTracks().forEach((track) => {
      track.onended = () => this.dispatch({ type: "failed", reason: "microphone" })
    })
    this.dispatch({ type: "ready" })
  }

  private releaseCapture() {
    if (this.processor) {
      this.processor.port.onmessage = null
      this.processor.onprocessorerror = null
      this.processor.disconnect()
      this.processor.port.close()
    }
    this.source?.disconnect()
    this.sink?.disconnect()
    this.stream?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })
    void this.context?.close().catch(() => undefined)
    this.processor = undefined
    this.source = undefined
    this.sink = undefined
    this.stream = undefined
    this.context = undefined
  }

  private release() {
    clearTimeout(this.timer)
    this.abort.abort()
    this.releaseCapture()
    if (!this.socket) return
    this.socket.onopen = null
    this.socket.onerror = null
    this.socket.onclose = null
    this.socket.onmessage = null
    this.socket.close()
    this.socket = undefined
  }
}

class DictationError extends Error {
  constructor(readonly reason: DictationFailure) {
    super(reason)
  }
}
