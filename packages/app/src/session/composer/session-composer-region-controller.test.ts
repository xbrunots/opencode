import { expect, test } from "bun:test"
import { interactiveExtensionChild } from "./session-composer-region-controller"

test("only direct extension setup workers are interactive", () => {
  const metadata = { opencodexExtensionFlow: "mcp", opencodexExtensionRoot: "root" }
  expect(interactiveExtensionChild({ parentID: "root", metadata })).toBe(true)
  expect(interactiveExtensionChild({ parentID: "other", metadata })).toBe(false)
  expect(interactiveExtensionChild({ metadata })).toBe(false)
  expect(interactiveExtensionChild({ parentID: "root", metadata: { ...metadata, opencodexExtensionFlow: "other" } })).toBe(false)
  expect(interactiveExtensionChild({ parentID: "root" })).toBe(false)
})
