import type { SessionMessageAssistantTool } from "@opencode/client/promise"
import { currentToolInput, currentToolMetadata, executeToolCalls } from "../message/current-tool-state"

/** The file is inferred only from a real write or patch, never from a read or a model's prose. */
export function htmlToolPath(name: string, input: Record<string, unknown>): string | undefined {
  if (name === "write" || name === "edit") {
    const path = input.path ?? input.filePath
    return typeof path === "string" && /\.html?$/i.test(path) ? path : undefined
  }
  if ((name === "patch" || name === "apply_patch") && typeof input.patchText === "string") {
    return /^\*\*\* (?:Add|Update) File: (.+\.html?)\s*$/im.exec(input.patchText)?.[1]?.trim()
  }
  if ((name === "shell" || name === "bash") && typeof input.command === "string") {
    return /(?:^|[^0-9])>{1,2}\s*["']?([^\s"';&|]+\.html?)(?=["'\s;&|]|$)/i.exec(input.command)?.[1]
  }
}

export function htmlGenerationActivity(tools: readonly SessionMessageAssistantTool[]) {
  const calls = tools.filter((tool) => tool.executed !== false).flatMap((tool) => {
    const status = tool.state.status
    const direct = { name: tool.name, status, input: currentToolInput(tool) }
    if (tool.name !== "execute" || status === "error") return [direct]

    return [
      direct,
      ...executeToolCalls(currentToolMetadata(tool))
        .filter((call) => call.status !== "running" || status === "running" || status === "streaming")
        .map((call) => ({ name: call.tool, status: call.status, input: call.input ?? {} })),
    ]
  })
  for (let index = calls.length - 1; index >= 0; index--) {
    const call = calls[index]!
    const path = htmlToolPath(call.name, call.input)
    if (!path) continue
    if (call.status === "running" || call.status === "streaming") return { path }
    if (call.status !== "completed") return undefined
    if (calls.slice(index + 1).some((item) => (item.name === "shell" || item.name === "bash") &&
      (item.status === "running" || item.status === "streaming"))) return { path }
    return undefined
  }
}
