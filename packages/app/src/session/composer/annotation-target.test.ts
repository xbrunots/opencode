import { expect, test } from "bun:test"
import { matchesAnnotationTarget } from "./annotation-target"

test("annotations require the server and session to match", () => {
  const target = { serverID: "server-a", sessionID: "shared-session" }
  expect(matchesAnnotationTarget({ serverID: "server-a", sessionID: "shared-session" }, target)).toBe(true)
  expect(matchesAnnotationTarget({ serverID: "server-b", sessionID: "shared-session" }, target)).toBe(false)
  expect(matchesAnnotationTarget({ sessionID: "shared-session" }, target)).toBe(false)
  expect(matchesAnnotationTarget({ serverID: "server-a", sessionID: "other" }, target)).toBe(false)
})
