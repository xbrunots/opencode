import { describe, expect, test } from "bun:test"
import type {
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
  SessionMessageUser,
} from "@opencode/client/promise"
import { conversationContextFacts } from "./conversation-context"

const user = (id: string, attachments: Pick<SessionMessageUser, "files" | "skills"> = {}): SessionMessageUser => ({
  id,
  type: "user",
  text: "Review the conversation context",
  time: { created: 0 },
  ...attachments,
})

const assistant = (content: SessionMessageAssistant["content"]): SessionMessageAssistant => ({
  id: "msg_assistant",
  type: "assistant",
  agent: "build",
  model: { id: "model", providerID: "provider" },
  content,
  time: { created: 0 },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
})

const tool = (
  name: string,
  state: SessionMessageAssistantTool["state"],
  executed?: boolean,
): SessionMessageAssistantTool => ({
  id: name,
  type: "tool",
  name,
  executed,
  state,
  time: { created: 0 },
})

const completed = (
  input: Extract<SessionMessageAssistantTool["state"], { status: "completed" }>["input"] = {},
): SessionMessageAssistantTool["state"] => ({
  status: "completed",
  input,
  content: [{ type: "text", text: "Done" }],
})

describe("conversation context facts", () => {
  test("shows automatically selected motion references by their friendly label", () => {
    const facts = conversationContextFacts([
      { id: "msg_motion", type: "skill", skill: "opencodex-motion:msg_request", name: "OpenCodex Motion Aura", text: "private instructions", time: { created: 0 } },
    ], [])

    expect(facts.skills).toEqual([{ id: "opencodex-motion:msg_request", name: "OpenCodex Motion Aura", text: undefined, count: 1, automatic: true }])
  })
  test("shows the latest automatic selection when Remotion is unavailable", () => {
    const facts = conversationContextFacts([
      { id: "msg_first", type: "skill", skill: "opencodex-motion:msg_request", name: "OpenCodex Motion Aura", text: '{"guides":["remotion"]}', time: { created: 0 } },
      { id: "msg_fallback", type: "skill", skill: "opencodex-motion:msg_request", name: "OpenCodex Motion Aura · Remotion unavailable", text: '{"guides":["launchVideo"],"source":"remotion-unavailable"}', time: { created: 1 } },
    ], [])
    expect(facts.skills).toEqual([{ id: "opencodex-motion:msg_request", name: "OpenCodex Motion Aura · Remotion unavailable", text: undefined, count: 2, automatic: true }])
  })
  test("an empty conversation never invents sources, artifacts, skills or MCP usage", () => {
    expect(conversationContextFacts([], [{ name: "unused-server" }])).toEqual({
      sources: [],
      files: [],
      artifacts: [],
      skills: [],
      mcps: [],
    })
  })

  test("deduplicates user file URIs while retaining independent inline attachments", () => {
    const facts = conversationContextFacts(
      [
        user("msg_first", {
          files: [
            {
              name: "plan.md",
              source: { type: "uri", uri: "file:///project/plan.md" },
              mime: "text/markdown",
              data: "",
            },
            { name: "first.txt", source: { type: "inline" }, mime: "text/plain", data: "aGVsbG8=" },
          ],
        }),
        user("msg_second", {
          files: [
            {
              name: "plan.md",
              source: { type: "uri", uri: "file:///project/plan.md" },
              mime: "text/markdown",
              data: "",
            },
            { name: "second.txt", source: { type: "inline" }, mime: "text/plain", data: "aGVsbG8=" },
          ],
        }),
      ],
      [],
    )
    expect(facts.files.map((file) => ({ name: file.name, href: file.href }))).toEqual([
      { name: "plan.md", href: "file:///project/plan.md" },
      { name: "first.txt", href: undefined },
      { name: "second.txt", href: undefined },
    ])
    expect(facts.files.filter((file) => !file.href).map((file) => file.data)).toEqual(["aGVsbG8=", "aGVsbG8="])
  })

  test("lists only completed, executed artifact files and deduplicates their URIs", () => {
    const file = {
      type: "file" as const,
      uri: "file:///project/report.pdf",
      name: "report.pdf",
      mime: "application/pdf",
    }
    const facts = conversationContextFacts(
      [
        assistant([
          tool("report", { status: "completed", input: {}, content: [file, { type: "text", text: "Report created" }] }),
          tool("report-again", { status: "completed", input: {}, content: [file] }),
          tool("failed-report", {
            status: "error",
            input: {},
            error: { type: "ToolExecutionError", message: "Failed" },
            content: [{ ...file, uri: "file:///project/failed.pdf" }],
          }),
          tool(
            "not-executed",
            { status: "completed", input: {}, content: [{ ...file, uri: "file:///project/skipped.pdf" }] },
            false,
          ),
          tool("still-streaming", { status: "streaming", input: "{}" }),
          tool("plain-text", completed()),
        ]),
      ],
      [],
    )
    expect(
      facts.artifacts.map((artifact) => ({ name: artifact.name, href: artifact.href, mime: artifact.mime })),
    ).toEqual([{ name: "report.pdf", href: "file:///project/report.pdf", mime: "application/pdf" }])
  })

  test("uses recorded skill loads for counts instead of counting their prompt attachments again", () => {
    const load = (id: string, skill: string, name: string, text: string): SessionMessageInfo => ({
      id,
      type: "skill",
      skill,
      name,
      text,
      time: { created: 0 },
    })
    const facts = conversationContextFacts(
      [
        user("msg_one", {
          skills: [
            { id: "skill_design", name: "Design", text: "Attached design" },
            { id: "skill_review", name: "Review" },
          ],
        }),
        user("msg_two", {
          skills: [
            { id: "skill_design", name: "Design" },
            { id: "skill_review", name: "Review" },
          ],
        }),
        load("msg_load_one", "skill_design", "Design", "Loaded design"),
        load("msg_load_two", "skill_test", "Test", "Loaded tests"),
        load("msg_load_three", "skill_test", "Test", "Loaded tests again"),
      ],
      [],
    )
    expect(facts.skills).toEqual([
      { id: "skill_design", name: "Design", text: "Loaded design", count: 1 },
      { id: "skill_review", name: "Review", text: undefined, count: 2 },
      { id: "skill_test", name: "Test", text: "Loaded tests again", count: 2 },
    ])
  })

  test("counts known MCP invocations through direct, nested and resource calls without native or skipped tools", () => {
    const facts = conversationContextFacts(
      [
        assistant([
          tool("git_status", completed()),
          tool("git_tools_search", completed()),
          tool("execute", {
            status: "running",
            input: { code: "await tools.git_tools.search({})" },
            metadata: {
              toolCalls: [
                { tool: "git_tools.search", status: "completed" },
                { tool: "git.status", status: "error" },
                { tool: "native.read", status: "completed" },
              ],
            },
          }),
          tool("opencode_read_mcp_resource", completed({ server: "git tools", uri: "docs://plan" })),
          tool("opencode_watch_mcp_event", { status: "running", input: { server: "git" }, metadata: {} }),
          tool("opencode_list_mcp_resources", completed({ server: "not-configured" })),
          tool("unknown_search", completed()),
          tool("read", completed({ path: "file.ts" })),
          tool("git_tools_streaming", { status: "streaming", input: "{}" }),
          tool("git_skipped", completed(), false),
          tool(
            "execute",
            { status: "running", input: {}, metadata: { toolCalls: [{ tool: "git.status", status: "completed" }] } },
            false,
          ),
        ]),
      ],
      [{ name: "git" }, { name: "git tools" }, { name: "unused" }],
    )
    expect(facts.mcps).toEqual([
      { name: "git", count: 3 },
      { name: "git tools", count: 3 },
    ])
  })
})
