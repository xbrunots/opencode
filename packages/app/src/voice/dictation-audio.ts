export type DictationWorkletEvent = { type: "audio"; buffer: ArrayBuffer; level: number } | { type: "flushed" }

/** OpenAI transcription accepts little-endian, mono PCM16 at 24 kHz. */
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
