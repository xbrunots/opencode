import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

/** A marker is deliberately required so an ordinary unpacked build keeps its normal profile. */
export function portableDirectory(executable: string) {
  const directory = path.dirname(executable)
  const marker = path.join(directory, "portable.json")
  if (!existsSync(marker)) return undefined

  const value: unknown = JSON.parse(readFileSync(marker, "utf8"))
  if (!value || typeof value !== "object" || !("format" in value) || !("version" in value))
    throw new Error(`Invalid portable marker: ${marker}`)
  if (value.format !== "opencode-portable" || value.version !== 1) throw new Error(`Invalid portable marker: ${marker}`)
  return directory
}

/** Copies have independent registration files, so they must not compete for the installed service's port. */
export function portablePort(directory: string) {
  const key = process.platform === "win32" ? path.resolve(directory).toLowerCase() : path.resolve(directory)
  return 0x4000 + (createHash("sha256").update(key).digest().readUInt16BE(0) % 0x3000)
}

export function portableEnvironment(root: string) {
  return {
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_CACHE_HOME: path.join(root, "cache"),
    XDG_STATE_HOME: path.join(root, "state"),
    OPENCODE_CONFIG_DIR: path.join(root, "config", "opencode"),
    OPENCODE_DB: "opencode.db",
  }
}
