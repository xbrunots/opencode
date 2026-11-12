import { expect, test } from "@playwright/test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { pageMessagesFrom, SERVER } from "../utils/app"
import { openSession } from "../utils/workspace"

test("conversation context leaves 8 pixels beside the timeline scrollbar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const id = "ses_context_edge"
  await openSession(page, {
    name: "ContextEdge",
    sessions: [{ id, title: "Context edge" }],
    seed: { tabs: [id] },
    pageMessages: pageMessagesFrom({
      [id]: [{ id: "msg_context_edge", type: "user", text: "A long conversation. ".repeat(1200), time: { created: 1 } }],
    }),
  })
  const card = page.getByRole("region", { name: "Conversation context", exact: true })
  const scrollbar = page.locator('[data-slot="session-timeline-visible"] .scroll-view__thumb[data-orientation="vertical"]')
  await expect(card).toBeVisible()
  await expect(scrollbar).toHaveCount(1)

  for (const width of [1440, 1024, 800]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(async () => {
      const cardBox = await card.boundingBox()

      const bar = await scrollbar.evaluate((element) => {
        const box = element.getBoundingClientRect()
        const width = parseFloat(getComputedStyle(element, "::after").width)

        return box.left + (box.width - width) / 2
      })

      return cardBox ? Math.abs(bar - cardBox.x - cardBox.width - 8) : Number.POSITIVE_INFINITY
    }).toBeLessThanOrEqual(1)
  }
})

test("shows the recorded motion evaluator only in conversation context", async ({ page }) => {
  const id = "ses_motion_context"
  const history: SessionMessageInfo[] = [
    { id: "msg_motion_user", type: "user", text: "Animate this interface", time: { created: 1 } },
    { id: "msg_motion_selection", type: "skill", skill: "opencodex-motion:msg_motion_user", name: "OpenCodex Motion Aura", text: "PRIVATE MOTION INSTRUCTIONS", time: { created: 2 } },
    { id: "msg_motion_fallback", type: "skill", skill: "opencodex-motion:msg_motion_user", name: "OpenCodex Motion Aura · Remotion unavailable", text: '{"guides":["launchVideo"],"source":"remotion-unavailable"}', time: { created: 2 } },
    { id: "msg_motion_answer", type: "assistant", agent: "build", model: { providerID: "opencode", id: "test" }, time: { created: 3, completed: 4 }, content: [{ type: "text", text: "Done" }], cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
  ]
  await openSession(page, {
    name: "MotionContext",
    sessions: [{ id, title: "Motion context" }],
    seed: { tabs: [id] },
    pageMessages: pageMessagesFrom({ [id]: history }),
  })
  const card = page.getByRole("region", { name: "Conversation context", exact: true })
  await expect(card.getByRole("button", { name: /OpenCodex Motion Aura · Remotion unavailable/ })).toBeVisible()
  await expect(page.getByText("OpenCodex Motion Aura · Remotion unavailable", { exact: true })).toHaveCount(1)
  await expect(page.getByText("PRIVATE MOTION INSTRUCTIONS")).toHaveCount(0)
})

test("conversation context shows recorded resources, opens review and subagents, and stays exclusive to Focus", async ({
  page,
}) => {
  const id = "ses_conversation_context"
  const child = "ses_context_worker"
  const history: SessionMessageInfo[] = [
    {
      id: "msg_context_user",
      type: "user",
      text: "Review the component",
      files: [
        {
          name: "requirements.txt",
          mime: "text/plain",
          data: "UmVxdWlyZW1lbnRz",
          source: { type: "uri", uri: "file:///C:/OpenCode/ConversationContext/requirements.txt" },
        },
      ],
      skills: [{ id: "skill_review", name: "review-ui", text: "Check contrast and keyboard navigation." }],
      time: { created: 1 },
    },
    {
      id: "msg_context_skill",
      type: "skill",
      skill: "skill_review",
      name: "review-ui",
      text: "Check contrast and keyboard navigation.",
      time: { created: 2 },
    },
    {
      id: "msg_context_assistant",
      type: "assistant",
      agent: "build",
      model: { providerID: "opencode", id: "test" },
      time: { created: 3, completed: 4 },
      content: [
        {
          type: "tool",
          id: "tool_source",
          name: "webfetch",
          time: { created: 3 },
          state: {
            status: "completed",
            input: { url: "https://example.com/context-guide", format: "markdown" },
            content: [{ type: "text", text: "# Context guide" }],
          },
        },
        {
          type: "tool",
          id: "tool_mcp",
          name: "github_get_issue",
          time: { created: 3 },
          state: { status: "completed", input: { number: 42 }, content: [{ type: "text", text: "Issue #42" }] },
        },
        {
          type: "tool",
          id: "tool_artifact",
          name: "write",
          time: { created: 3 },
          state: {
            status: "completed",
            input: {},
            content: [
              {
                type: "file",
                name: "report.md",
                mime: "text/markdown",
                uri: "file:///C:/OpenCode/ConversationContext/report.md",
              },
            ],
          },
        },
      ],
    },
  ]
  const ranges: { sessionID: string; from?: string; to?: string }[] = []
  const openedFiles: string[] = []
  await openSession(page, {
    name: "ConversationContext",
    sessions: [
      { id, title: "Review the component" },
      {
        id: child,
        title: "Accessibility review",
        parentID: id,
        model: { providerID: "anthropic", id: "claude-sonnet" },
        outcome: "succeeded",
      },
    ],
    seed: { tabs: [id, child], panes: { [id]: { review: false } } },
    pageMessages: pageMessagesFrom({ [id]: history }),
    vcs: { current: "context-polish", default: "main" },
    mcp: [{ name: "github", title: "GitHub", status: { status: "connected" } }],
    fileContent: (path) => {
      openedFiles.push(path)
      return "# Report from the tool"
    },
    sessionDiff: (range) => {
      ranges.push(range)
      return [{ file: "src/component.tsx", patch: "", additions: 12, deletions: 3, status: "modified" }]
    },
  })
  const card = page.getByRole("region", { name: "Conversation context", exact: true })
  await expect(card).toBeVisible()
  await expect(card).toContainText("context-polish")
  await expect(card.getByRole("button", { name: /Changes/ })).toContainText("+12")
  await expect(card.getByRole("button", { name: /Changes/ })).toContainText("−3")
  await expect(card.getByRole("button", { name: /Accessibility review Completed/ })).toBeVisible()
  await expect(card.getByRole("button", { name: /requirements.txt/ })).toBeVisible()
  await expect(card.getByRole("button", { name: /report.md/ })).toBeVisible()
  await expect(card.getByRole("button", { name: /github 1 call/ })).toBeVisible()
  await expect(card.getByRole("button", { name: /review-ui ×1/ })).toBeVisible()
  await expect
    .poll(() =>
      ranges.some(
        (range) => range.sessionID === id && range.from === "msg_context_user" && range.to === "msg_context_user",
      ),
    )
    .toBe(true)
  await card.getByRole("button", { name: /review-ui ×1/ }).click()
  await expect(page.getByRole("dialog")).toContainText("Check contrast and keyboard navigation.")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await card.getByRole("button", { name: /report.md/ }).click()
  await expect.poll(() => openedFiles.some((path) => path.endsWith("report.md"))).toBe(true)
  await expect(page.locator("#review-panel")).toContainText("Report from the tool")
  await expect(card).toHaveCount(0)
  const sideToggle = page.locator('button[aria-controls="review-panel"]')
  await sideToggle.click()
  await expect(card).toBeVisible()
  await card.getByRole("button", { name: /Changes/ }).click()
  await expect(page.locator("#review-panel")).toHaveAttribute("aria-hidden", "false")
  await expect(card).toHaveCount(0)
  await sideToggle.click()
  await expect(card).toBeVisible()
  await card.getByRole("button", { name: "Close conversation context", exact: true }).click()
  await expect(card).toHaveCount(0)
  await page.getByRole("button", { name: "Conversation context", exact: true }).click()
  await expect(card).toBeVisible()
  await page.getByRole("button", { name: "Conversation layout", exact: true }).click()
  await page.getByRole("menuitemradio", { name: "Grid", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(card).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Conversation context", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Conversation layout", exact: true }).click()
  await page.getByRole("menuitemradio", { name: "Focus", exact: true }).click()
  await expect(card).toBeVisible()
  await card.getByRole("button", { name: /Accessibility review Completed/ }).click()
  await expect(page).toHaveURL(new RegExp(`${child}$`))
})

test("empty context records no sources, artifacts, integrations or skills", async ({ page }) => {
  await openSession(page, { name: "EmptyConversationContext" })
  const card = page.getByRole("region", { name: "Conversation context", exact: true })
  await expect(card).toBeVisible()
  await expect(card.getByText("Loading context…", { exact: true })).toHaveCount(0)
  for (const title of ["Subagents", "Sources", "Artifacts", "MCPs used", "Skills used"]) {
    await expect(card.getByText(title, { exact: true }).locator("..")).toContainText("0")
  }
  await card.locator("summary").filter({ hasText: "Sources" }).click()
  await expect(card.getByText("No web sources or attached files recorded.", { exact: true })).toBeVisible()
})

test("context refreshes working changes after a filesystem event", async ({ page }) => {
  let additions = 2
  const workspace = await openSession(page, {
    name: "LiveConversationContext",
    vcs: { current: "feature/live", default: "main" },
    vcsDiff: () => [{ file: "src/live.ts", patch: "", additions, deletions: 1, status: "modified" }],
  })
  const card = page.getByRole("region", { name: "Conversation context", exact: true })
  const changes = card.getByRole("button", { name: /Changes/ })
  await expect(changes).toContainText("+2")
  additions = 9
  await workspace.push([
    {
      id: "evt_live_context",
      created: 1,
      type: "filesystem.changed",
      location: { directory: workspace.directory },
      data: { file: "src/live.ts", event: "change" },
    },
  ])
  await expect(changes).toContainText("+9")
  await expect(card).toContainText("feature/live")
})
test("conversation context contains searchable skills and extension setup actions", async ({ page }) => {
  await openSession(page, {
    name: "ContextExtensions",
    commands: [{ name: "opencodex-mcp", description: "Configure MCP" }],
    skills: [
      {
        id: "skill_one",
        name: "review-ui",
        description: "Review UI",
        path: "C:/OpenCode/skills/review-ui/SKILL.md",
        content: "Check the UI.",
      },
      {
        id: "skill_two",
        name: "write-tests",
        description: "Write tests",
        path: "C:/OpenCode/skills/write-tests/SKILL.md",
        content: "Check tests.",
      },
    ],
    mcp: [{ name: "github", title: "GitHub", status: { status: "connected" } }],
  })
  const card = page.getByRole("region", { name: "Conversation context", exact: true })
  await expect(card).toBeVisible()
  await card.locator("summary").filter({ hasText: "Available skills" }).click()
  const search = card.getByRole("textbox", { name: "Search skills" })
  await expect(card.getByRole("button", { name: "review-ui", exact: true })).toBeVisible()
  await expect(card.getByRole("button", { name: "write-tests", exact: true })).toBeVisible()
  await search.fill("review")
  await expect(card.getByRole("button", { name: "review-ui", exact: true })).toBeVisible()
  await expect(card.getByRole("button", { name: "write-tests", exact: true })).toHaveCount(0)
  await expect(card.getByRole("button", { name: "Add skill with OpenCodex", exact: true })).toBeVisible()
  await card.locator("summary").filter({ hasText: "Plugins" }).click()
  await expect(card.getByRole("button", { name: "Add plugin with OpenCodex", exact: true })).toBeVisible()
  await card.locator("summary").filter({ hasText: "MCP servers" }).click()
  await expect(card.getByRole("button", { name: "github", exact: true })).toBeVisible()
  const route = page.url()
  await card.getByRole("button", { name: "Add MCP server with OpenCodex", exact: true }).click()
  await expect(page).toHaveURL(route)
  const floating = page.locator(".workspace-floating-chat")
  await expect(floating.locator('[data-component="composer-editor"]')).toContainText("/opencodex-mcp Help me add an MCP server")
})
test("context opens the configuration file for the selected extension", async ({ page }) => {
  const config = "C:/OpenCode/ConfigContext/opencode.jsonc"
  await openSession(page, {
    name: "ConfigContext",
    configEntries: [
      {
        type: "document",
        path: config,
        info: { mcp: { servers: { example: { type: "remote", url: "https://example.com" } } } },
      },
    ],
    fileContent: () => ({ type: "text", content: "{ }" }),
  })
  const card = page.getByRole("region", { name: "Conversation context", exact: true })
  await card.locator("summary").filter({ hasText: "MCP servers" }).click()
  const read = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith("/api/fs/read/opencode.jsonc"))
  await card.getByRole("button", { name: "Configuration file", exact: true }).click()
  expect(new URL((await read).url()).searchParams.get("location[directory]")).toContain("ConfigContext")
  await expect(page.getByRole("tab", { name: "opencode.jsonc", exact: true })).toBeVisible()
})

for (const extension of [
  { section: "Plugins", action: "Add plugin with OpenCodex", prompt: "/opencodex-plugin Help me add a plugin" },
  { section: "Available skills", action: "Add skill with OpenCodex", prompt: "/opencodex-skill Help me write a new OpenCode skill" },
]) {
  test(`extension setup floats over the current session: ${extension.section}`, async ({ page }) => {
    await openSession(page, {
      name: `Draft${extension.section.replaceAll(" ", "")}`,
      commands: [{ name: extension.prompt.split(" ")[0]!.slice(1), description: "Configure extension" }],
    })
    const route = page.url()
    const card = page.getByRole("region", { name: "Conversation context", exact: true })
    await card.locator("summary").filter({ hasText: extension.section }).click()
    await card.getByRole("button", { name: extension.action, exact: true }).click()
    await expect(page).toHaveURL(route)
    await expect(page.locator('.workspace-floating-chat [data-component="composer-editor"]')).toContainText(extension.prompt)
  })
}

test("extension setup command opens the real child without leaving the original session", async ({ page }) => {
  const calls: { sessionID: string; body: unknown }[] = []
  const workspace = await openSession(page, {
    name: "SetupChild",
    commands: [{ name: "opencodex-mcp", description: "Configure MCP" }],
    onCommand: (input) => calls.push(input),
  })
  const route = page.url()
  const card = page.getByRole("region", { name: "Conversation context", exact: true })
  await card.locator("summary").filter({ hasText: "MCP servers" }).click()
  await card.getByRole("button", { name: "Add MCP server with OpenCodex", exact: true }).click()
  const floating = page.locator(".workspace-floating-chat")
  const editor = floating.locator('[data-component="composer-editor"]')
  await expect(editor).toContainText("/opencodex-mcp")
  await editor.press("Enter")
  await expect.poll(() => calls.length).toBe(1)
  const root = calls[0]!.sessionID
  const child = `ses_opencodex_ext_${root.slice(4)}`
  const metadata = { opencodexExtensionFlow: "mcp", opencodexExtensionRoot: root, opencodexExtensionOwner: workspace.session.id }
  const response = await page.evaluate(async ({ server, root, child, metadata }) => {
    const result = await fetch(`${server}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: child, parentID: root, title: "Configure MCP", agent: "general", metadata, outcome: "succeeded" }),
    })
    return result.status
  }, { server: SERVER, root, child, metadata })
  expect(response).toBe(200)
  await workspace.push([
    {
      id: "evt_setup_child_created",
      created: 1,
      type: "session.created",
      location: { directory: workspace.directory },
      durable: { aggregateID: child, seq: 1, version: 1 },
      data: { sessionID: child, parentID: root, projectID: workspace.projectID, location: { directory: workspace.directory }, slug: child, title: "Configure MCP", agent: "general", metadata, version: "dev" },
    },
    {
      id: "evt_setup_child_started",
      created: 2,
      type: "session.execution.started",
      durable: { aggregateID: child, seq: 2, version: 1 },
      data: { sessionID: child },
    },
  ])
  await expect(page).toHaveURL(route)
  await expect(floating).toHaveAttribute("aria-label", new RegExp(`Configure MCP|${child}`))
  await expect(floating.locator('[data-component="composer-editor"]')).toBeEditable()
  await floating.getByRole("button", { name: "Close conversation pane" }).click()
  await expect(card).toContainText("Configure MCP")
  await expect(card.getByRole("button", { name: /Configure MCP/ })).toBeVisible()
  await card.getByRole("button", { name: /Configure MCP/ }).click()
  await expect(page).toHaveURL(route)
})

test("a failed setup command keeps the draft in the floating chat", async ({ page }) => {
  await openSession(page, {
    name: "FailedSetup",
    commands: [{ name: "opencodex-skill", description: "Configure skill" }],
  })
  const card = page.getByRole("region", { name: "Conversation context", exact: true })
  await card.locator("summary").filter({ hasText: "Available skills" }).click()
  await card.getByRole("button", { name: "Add skill with OpenCodex", exact: true }).click()
  const floating = page.locator(".workspace-floating-chat")
  const editor = floating.locator('[data-component="composer-editor"]')
  await expect(editor).toContainText("/opencodex-skill")
  await editor.press("Enter")
  await expect(editor).toContainText("/opencodex-skill")
  await expect(floating).toHaveAttribute("aria-label", "Add skill with OpenCodex")
})

for (const decision of ["once", "reject"] as const) {
  test(`extension setup permission can be ${decision === "once" ? "allowed" : "rejected"} in the floating chat`, async ({ page }) => {
    const replied = Promise.withResolvers<string>()
    const requested = Promise.withResolvers<string>()
    const workspace = await openSession(page, {
      name: `SetupPermission${decision}`,
      commands: [{ name: "opencodex-mcp", description: "Configure MCP" }],
      onPermissionReply: (value) => replied.resolve((value.body as { decision: string }).decision),
    })
    await page.route("**/api/session/*/command", async (route) => {
      requested.resolve(new URL(route.request().url()).pathname.split("/")[3]!)
      const answer = await replied.promise
      await route.fulfill(answer === "once" ? { status: 204, body: "" } : { status: 403, body: "Permission denied" })
    })
    const route = page.url()
    const card = page.getByRole("region", { name: "Conversation context", exact: true })
    await card.locator("summary").filter({ hasText: "MCP servers" }).click()
    await card.getByRole("button", { name: "Add MCP server with OpenCodex", exact: true }).click()
    const floating = page.locator(".workspace-floating-chat")
    const editor = floating.locator('[data-component="composer-editor"]')
    await expect(editor).toContainText("/opencodex-mcp")
    await editor.press("Enter")
    const root = await requested.promise
    await workspace.push([{
      id: `evt_setup_permission_${decision}`,
      created: 1,
      type: "permission.asked",
      location: { directory: workspace.directory },
      data: { id: `per_setup_${decision}`, sessionID: root, action: "subagent", resources: ["general"], metadata: {}, save: ["general"] },
    }])
    const permission = floating.locator('[data-component="dock-prompt"][data-kind="permission"]')
    await expect(permission).toBeVisible()
    await permission.getByRole("button", { name: decision === "once" ? "Allow once" : "Deny" }).click()
    expect(await replied.promise).toBe(decision)
    await expect(permission).toHaveCount(0)
    await expect(page).toHaveURL(route)
    if (decision === "reject") {
      await expect(editor).toContainText("/opencodex-mcp")
      return
    }
    const child = `ses_opencodex_ext_${root.slice(4)}`
    const metadata = { opencodexExtensionFlow: "mcp", opencodexExtensionRoot: root, opencodexExtensionOwner: workspace.session.id }
    await page.evaluate(async ({ server, root, child, metadata }) => {
      await fetch(`${server}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: child, parentID: root, title: "Configure MCP", agent: "general", metadata }),
      })
    }, { server: SERVER, root, child, metadata })
    await workspace.push([
      { id: "evt_setup_permission_child", created: 2, type: "session.created", location: { directory: workspace.directory }, durable: { aggregateID: child, seq: 1, version: 1 }, data: { sessionID: child, parentID: root, projectID: workspace.projectID, location: { directory: workspace.directory }, slug: child, title: "Configure MCP", agent: "general", metadata, version: "dev" } },
      { id: "evt_setup_permission_run", created: 3, type: "session.execution.started", durable: { aggregateID: child, seq: 2, version: 1 }, data: { sessionID: child } },
    ])
    await expect(floating).toHaveAttribute("aria-label", new RegExp(`Configure MCP|${child}`))
  })
}
