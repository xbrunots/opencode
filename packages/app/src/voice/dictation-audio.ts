export type DictationWorkletEvent = { type: "audio"; buffer: ArrayBuffer; level: number } | { type: "flushed" }

/** The local recognizer consumes mono PCM16 frames at 16 kHz. */
export function dictationPCM(samples: Float32Array) {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)
  let energy = 0
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(index * 2, sample * (sample < 0 ? 32768 : 32767), true)
    energy += sample * sample
  }
  return { buffer, level: samples.length ? Math.sqrt(energy / samples.length) : 0 }
}

export function dictationFloat(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  const samples = new Float32Array(buffer.byteLength / 2)
  for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true) / 32768
  return samples
}
