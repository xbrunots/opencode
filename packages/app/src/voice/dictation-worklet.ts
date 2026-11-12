import { dictationPCM } from "./dictation-audio"

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  abstract process(inputs: Float32Array[][]): boolean
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void

class DictationProcessor extends AudioWorkletProcessor {
  private samples = new Float32Array(1600)
  private offset = 0
  private state: { status: "capturing" } | { status: "closed" } = { status: "capturing" }

  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent<{ type: "flush" }>) => {
      if (event.data.type !== "flush") return
      this.state = { status: "closed" }
      this.send()
      this.port.postMessage({ type: "flushed" })
    }
  }

  process(inputs: Float32Array[][]) {
    if (this.state.status === "closed") return false
    const channels = inputs[0]
    if (!channels?.length) return true
    for (let frame = 0; frame < channels[0].length; frame++) {
      let sample = 0
      for (const channel of channels) sample += channel[frame]
      this.samples[this.offset++] = sample / channels.length
      if (this.offset !== this.samples.length) continue
      this.send()
    }
    return true
  }

  private send() {
    if (!this.offset) return
    const pcm = dictationPCM(this.samples.subarray(0, this.offset))
    this.port.postMessage({ type: "audio", ...pcm }, [pcm.buffer])
    this.offset = 0
  }
}

registerProcessor("opencode-dictation", DictationProcessor)
