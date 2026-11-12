import type { KaldiRecognizer, Model } from "vosk-browser"
import type { Platform } from "@/runtime/platform/platform"
import workletURL from "./dictation-worklet?worker&url"
import { dictationFloat, type DictationWorkletEvent } from "./dictation-audio"
import {
  transitionDictationTransport,
  type DictationFailure,
  type DictationTransportEvent,
  type DictationTransportState,
} from "./dictation-transport-machine"

export type DictationEnvironment = {
  platform: Pick<Platform, "requestMicrophone">
}

const modelURL = new URL("/speech/vosk-model-small-pt-0.3.tar.gz", window.location.href).href

/** Portuguese speech recognition runs entirely in a local WASM worker. */
export class DictationTransport {
  private state: DictationTransportState = { status: "starting" }
  private abort = new AbortController()
  private model?: Model
  private recognizer?: KaldiRecognizer
  private pendingFrames = 0
  private segments: string[] = []
  private stream?: MediaStream
  private context?: AudioContext
  private source?: MediaStreamAudioSourceNode
  private processor?: AudioWorkletNode
  private sink?: GainNode
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    private input: DictationEnvironment & {
      started: () => void
      stopped: () => void
      complete: (text: string) => void
      failed: (reason: DictationFailure) => void
    },
  ) {}

  start() {
    this.timer = setTimeout(() => this.dispatch({ type: "failed", reason: "model" }), 60_000)
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
      if (effect.type === "drain") {
        clearTimeout(this.timer)
        this.releaseCapture()
        this.timer = setTimeout(() => this.dispatch({ type: "failed", reason: "failed" }), 60_000)
        if (!this.pendingFrames) this.dispatch({ type: "drained" })
        return
      }
      this.recognizer?.retrieveFinalResult()
    })
  }

  private async prepare() {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) throw new DictationError("unsupported")
    const context = new AudioContext({ sampleRate: 16_000 })
    this.context = context
    await context.resume()
    if (this.input.platform.requestMicrophone && !(await this.input.platform.requestMicrophone()))
      throw new DictationError("microphone")
    this.abort.signal.throwIfAborted()
    const { Model } = await import("vosk-browser")
    this.abort.signal.throwIfAborted()
    const model = new Model(modelURL, -2)
    this.model = model
    await new Promise<void>((resolve, reject) => {
      model.on("load", (message) => {
        if (message.event === "load" && message.result) return resolve()
        reject(new DictationError("model"))
      })
      model.on("error", () => {
        reject(new DictationError("model"))
        this.dispatch({ type: "failed", reason: "model" })
      })
      this.abort.signal.addEventListener("abort", () => reject(this.abort.signal.reason), { once: true })
    })
    this.abort.signal.throwIfAborted()
    const recognizer = new model.KaldiRecognizer(16_000)
    this.recognizer = recognizer
    recognizer.on("result", (message) => {
      if (message.event !== "result" || this.state.status === "closed") return
      if (message.result.text.trim()) this.segments.push(message.result.text.trim())
      if (this.state.status === "finishing") {
        this.dispatch({ type: "final", text: this.segments.join(" ") })
        return
      }
      this.frameAcknowledged()
    })
    recognizer.on("partialresult", () => this.frameAcknowledged())
    recognizer.on("error", () => this.dispatch({ type: "failed", reason: "model" }))
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
    if (!context.audioWorklet || context.sampleRate !== 16_000) throw new DictationError("unsupported")
    await context.audioWorklet.addModule(workletURL)
    this.abort.signal.throwIfAborted()
    this.capture()
  }

  private frameAcknowledged() {
    if (this.state.status === "closed") return
    if (this.pendingFrames > 0) this.pendingFrames--
    if (!this.pendingFrames && this.state.status === "draining") this.dispatch({ type: "drained" })
  }

  private capture() {
    if (!this.context || !this.stream || !this.recognizer) return
    const recognizer = this.recognizer
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
      if (this.state.status !== "listening" && this.state.status !== "flushing") return
      const samples = dictationFloat(message.data.buffer)
      this.pendingFrames++
      recognizer.acceptWaveformFloat(samples, 16_000)
      this.dispatch({ type: "audio", samples: samples.length, level: message.data.level })
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
    this.recognizer?.remove()
    this.model?.terminate()
    this.recognizer = undefined
    this.model = undefined
    this.segments = []
  }
}

class DictationError extends Error {
  constructor(readonly reason: DictationFailure) {
    super(reason)
  }
}
