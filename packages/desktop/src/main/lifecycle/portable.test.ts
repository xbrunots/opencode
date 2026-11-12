import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { portableDirectory, portableEnvironment, portablePort } from "./portable"

const root = mkdtempSync(path.join(tmpdir(), "opencode-portable-"))
const executable = path.join(root, "OpenCode.exe")
const marker = path.join(root, "portable.json")
afterAll(() => rmSync(root, { recursive: true, force: true }))

test("only a valid portable marker selects the executable directory", () => {
  expect(portableDirectory(executable)).toBeUndefined()
  writeFileSync(marker, JSON.stringify({ format: "opencode-portable", version: 1 }))
  expect(portableDirectory(executable)).toBe(root)
  writeFileSync(marker, JSON.stringify({ format: "opencode-portable", version: 2 }))
  expect(() => portableDirectory(executable)).toThrow("Invalid portable marker")
})

test("portable service port is stable for a directory and separate from the installed service default", () => {
  const port = portablePort(root)
  expect(portablePort(path.join(root, "."))).toBe(port)
  expect(port).toBeGreaterThanOrEqual(0x4000)
  expect(port).toBeLessThan(0x7000)
  expect(port).not.toBe(0x70de)
})

test("portable storage and service registration are rooted beside the application", () => {
  expect(portableEnvironment(path.join(root, "data"))).toEqual({
    XDG_DATA_HOME: path.join(root, "data", "data"),
    XDG_CONFIG_HOME: path.join(root, "data", "config"),
    XDG_CACHE_HOME: path.join(root, "data", "cache"),
    XDG_STATE_HOME: path.join(root, "data", "state"),
    OPENCODE_CONFIG_DIR: path.join(root, "data", "config", "opencode"),
    OPENCODE_DB: "opencode.db",
  })
})
