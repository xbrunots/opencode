import type { SessionMessageAssistantTool } from "@opencode/client/promise"
import { describe, expect, test } from "bun:test"
import { htmlGenerationActivity, htmlToolPath } from "./html-activity"

function running(name: string, input: Record<string, string>): SessionMessageAssistantTool {
  return { type: "tool", id: name, name, state: { status: "running", input, metadata: {} }, time: { created: 1 } }
}
function completed(name: string, input: Record<string, string>): SessionMessageAssistantTool {
  return { type: "tool", id: name, name, state: { status: "completed", input, content: [{ type: "text", text: "done" }] }, time: { created: 1, ran: 2, completed: 3 } }
}

describe("HTML generation activity", () => {
  test("detects real running writes and patches", () => {
    expect(htmlGenerationActivity([running("write", { path: "site/index.html" })])).toEqual({ path: "site/index.html" })
    expect(htmlGenerationActivity([running("patch", { patchText: "*** Begin Patch\n*** Add File: effect.html\n+x\n*** End Patch" })])).toEqual({ path: "effect.html" })
  })
  test("keeps the activity visible while a subsequent shell runs", () => {
    expect(htmlGenerationActivity([completed("write", { path: "effect.html" }), running("shell", { command: "npm test" })])).toEqual({ path: "effect.html" })
    expect(htmlGenerationActivity([completed("write", { path: "effect.html" })])).toBeUndefined()
  })
  test("does not invent activity for reads, unrelated shell commands or errors", () => {
    expect(htmlGenerationActivity([running("read", { path: "index.html" })])).toBeUndefined()
    expect(htmlGenerationActivity([running("shell", { command: "cat index.html" })])).toBeUndefined()
    expect(htmlGenerationActivity([completed("write", { path: "index.html" }), running("read", { path: "index.html" })])).toBeUndefined()
    const failed: SessionMessageAssistantTool = { type: "tool", id: "failed", name: "write", state: { status: "error", input: { path: "index.html" }, error: { type: "ToolExecutionError", message: "failed" } }, time: { created: 1 } }
    expect(htmlGenerationActivity([failed])).toBeUndefined()
  })
  test("uses nested execute calls only while their parent is live", () => {
    const live: SessionMessageAssistantTool = {
      type: "tool", id: "execute", name: "execute",
      state: { status: "running", input: {}, metadata: { toolCalls: [{ tool: "write", status: "running", input: { path: "page.html" } }] } },
      time: { created: 1 },
    }
    expect(htmlGenerationActivity([live])).toEqual({ path: "page.html" })
    const stale: SessionMessageAssistantTool = {
      ...live,
      state: { status: "completed", input: {}, metadata: { toolCalls: [{ tool: "write", status: "running", input: { path: "page.html" } }] }, content: [{ type: "text", text: "done" }] },
    }
    expect(htmlGenerationActivity([stale])).toBeUndefined()
  })
  test("recognizes shell output redirection, but not a source file being read", () => {
    expect(htmlToolPath("shell", { command: "cat template > result.html" })).toBe("result.html")
    expect(htmlToolPath("shell", { command: "cat index.html > output.txt" })).toBeUndefined()
    expect(htmlToolPath("patch", { patchText: "*** Delete File: old.html" })).toBeUndefined()
  })
})
