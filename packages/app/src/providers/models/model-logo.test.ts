import { expect, test } from "bun:test"
import { modelLogo } from "./model-logo"

test("model logos identify model families before provider and ambiguous names", () => {
  const examples = [
    [{ id: "meta-models/Muse-Spark-1.3" }, "meta"],
    [{ id: "deepinfra/meta-models/Muse-Glimmer-30B" }, "meta"],
    [{ id: "gpt-codex-spark" }, "openai"],
    [{ id: "claude-sonnet-4.5" }, "claude"],
    [{ id: "gemini-2.5-pro" }, "gemini"],
    [{ id: "qwen3-coder" }, "qwen"],
    [{ id: "openrouter/unknown", family: "llama-4" }, "meta"],
    [{ id: "unknown", name: "Muse Spark 1.3" }, "meta"],
    [{ id: "openrouter/unknown" }, "openrouter"],
    [{ id: "unknown" }, undefined],
  ] as const

  for (const [model, logo] of examples) expect(modelLogo(model)).toBe(logo)
})
