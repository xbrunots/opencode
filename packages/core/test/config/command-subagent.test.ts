import { describe, expect } from "bun:test"
import path from "path"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { LanguageModel } from "@opencode/ai/effect"
import { OpenAIChat } from "@opencode/ai/protocols/openai-chat"
import { TestLLM } from "@opencode/ai/testing"
import { Agent } from "@opencode/core/agent"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Bus } from "@opencode/core/bus"
import { LayerNodePlatform } from "@opencode/core/effect/app-node-platform"
import { Watcher } from "@opencode/core/filesystem/watcher"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { Permission } from "@opencode/core/permission"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { tempGlobalLayer } from "../fixture/global"
import { offlineModels } from "../fixture/models"
import { tmpdirScoped } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const llmLayer = TestLLM.testLayer({ fallback: TestLLM.text("Review complete", "review") })
const it = testEffect(
  Layer.merge(
    llmLayer,
    AppNodeBuilder.build(LayerNode.group([Session.node, LocationServiceMap.node, Bus.node]), [
      Global.node.replace(tempGlobalLayer),
      offlineModels,
      Watcher.node.replace(Watcher.configured({ enabled: false })),
      LayerNodePlatform.llmClient.replace(llmLayer),
      SessionRunnerModel.node.replace(
        Layer.succeed(SessionRunnerModel.Service, {
          resolve: (session) =>
            Effect.succeed(
              SessionRunnerModel.resolved(
                LanguageModel.make({ id: session.model?.id ?? "parent", provider: "test", route: OpenAIChat.route }),
                {
                  capabilities: { tools: true, input: ["text"], output: ["text"] },
                  cost: [],
                  limit: { context: 200_000, output: 32_000 },
                },
              ),
            ),
        }),
      ),
    ]),
  ),
)

const parentModel = Model.Ref.make({ id: Model.ID.make("parent"), providerID: Provider.ID.make("test") })

describe("command subagents", () => {
  it.live("extension setup launches one real subagent and keeps the parent idle", () =>
    Effect.gen(function* () {
      const projectInfo = yield* project({}, "json")
      const sessions = yield* Session.Service
      const llm = yield* TestLLM.Test
      const gate = yield* llm.gate()
      const id = Session.ID.create()
      const parent = yield* sessions.create({
        id,
        location: projectInfo.location,
        title: "Configure MCP",
        agent: Agent.ID.make("build"),
        model: parentModel,
        permissions: [{ action: "subagent", resource: "general", effect: "allow" }],
        metadata: { opencodexExtensionFlow: "mcp", opencodexExtensionRoot: id, opencodexExtensionOwner: projectInfo.id },
      })

      yield* Effect.all([
        sessions.command({ sessionID: parent.id, command: "opencodex-mcp", text: "Configure the requested server; !`not-a-command`" }),
        sessions.command({ sessionID: parent.id, command: "opencodex-mcp", text: "Configure the requested server; !`not-a-command`" }),
      ], { concurrency: "unbounded" })
      yield* gate.started
      const children = (yield* sessions.list({ parentID: parent.id })).data
      expect(children).toHaveLength(1)
      const child = children[0]
      if (!child) return yield* Effect.die("Expected setup subagent")
      expect(child).toMatchObject({ agent: "general", title: "Configure MCP", parentID: parent.id })
      expect((yield* sessions.context(child.id)).filter((message) => message.type === "user")).toMatchObject([
        { text: expect.stringContaining("Configure the requested server; !`not-a-command`") },
      ])
      expect(yield* sessions.context(parent.id)).toEqual([])
      yield* gate.release
      yield* sessions.wait(child.id)
      expect((yield* sessions.context(parent.id)).filter((message) => message.type === "synthetic")).toEqual([])
      expect(yield* llm.requests()).toHaveLength(1)
    }),
  )

  it.live("extension setup respects subagent denial", () =>
    Effect.gen(function* () {
      const projectInfo = yield* project({}, "json")
      const sessions = yield* Session.Service
      const id = Session.ID.create()
      const parent = yield* sessions.create({
        id,
        location: projectInfo.location,
        agent: Agent.ID.make("build"),
        model: parentModel,
        permissions: [{ action: "subagent", resource: "*", effect: "deny" }],
        metadata: { opencodexExtensionFlow: "skill", opencodexExtensionRoot: id, opencodexExtensionOwner: projectInfo.id },
      })
      yield* Effect.flip(sessions.command({ sessionID: parent.id, command: "opencodex-skill", text: "Create a skill" }))
      expect((yield* sessions.list({ parentID: parent.id })).data).toEqual([])
    }),
  )

  it.live("extension setup asks for permission on the floating parent before starting", () =>
    Effect.gen(function* () {
      const projectInfo = yield* project({}, "json")
      const sessions = yield* Session.Service
      const id = Session.ID.create()
      const parent = yield* sessions.create({
        id,
        location: projectInfo.location,
        agent: Agent.ID.make("build"),
        model: parentModel,
        permissions: [{ action: "subagent", resource: "general", effect: "ask" }],
        metadata: { opencodexExtensionFlow: "skill", opencodexExtensionRoot: id, opencodexExtensionOwner: projectInfo.id },
      })
      const bus = yield* Bus.Service
      const asked = yield* Deferred.make<Permission.Request>()
      const unsubscribe = yield* bus.listen((event) => {
        if (event.type !== Permission.Event.Asked.type) return Effect.void
        const request = event.data as Permission.Request
        if (request.sessionID !== parent.id) return Effect.void
        return Deferred.succeed(asked, request).pipe(Effect.asVoid)
      })
      yield* Effect.addFinalizer(() => unsubscribe)
      const pending = yield* sessions.command({ sessionID: parent.id, command: "opencodex-skill", text: "Create a skill" }).pipe(Effect.forkScoped)
      const request = yield* Deferred.await(asked)
      expect(request.action).toBe("subagent")
      expect((yield* sessions.list({ parentID: parent.id })).data).toEqual([])
      const locations = yield* LocationServiceMap.Service
      const permissions = yield* Permission.Service.pipe(Effect.provide(locations.get(parent.location)))
      yield* permissions.reply({ requestID: request.id, reply: "once" })
      yield* Fiber.join(pending)
      expect((yield* sessions.list({ parentID: parent.id })).data).toHaveLength(1)
    }),
  )

  it.live("retry resumes an admitted setup prompt after an interrupted launch", () =>
    Effect.gen(function* () {
      const projectInfo = yield* project({}, "json")
      const sessions = yield* Session.Service
      const id = Session.ID.create()
      const parent = yield* sessions.create({
        id,
        location: projectInfo.location,
        title: "Configure plugin",
        agent: Agent.ID.make("build"),
        model: parentModel,
        permissions: [{ action: "subagent", resource: "general", effect: "allow" }],
        metadata: { opencodexExtensionFlow: "plugin", opencodexExtensionRoot: id, opencodexExtensionOwner: projectInfo.id },
      })
      const childID = Session.ID.make(`ses_opencodex_ext_${id.slice(4)}`)
      const child = yield* sessions.create({ id: childID, parentID: parent.id, agent: Agent.ID.make("general"), model: parentModel })
      yield* sessions.prompt({
        id: SessionMessage.ID.make(`msg_opencodex_ext_${id.slice(4)}`),
        sessionID: child.id,
        text: "Configure the original plugin",
        resume: false,
      })
      yield* sessions.command({ sessionID: parent.id, command: "opencodex-plugin", text: "A retried payload" })
      yield* sessions.wait(child.id)
      const messages = (yield* sessions.context(child.id)).filter((message) => message.type === "user")
      expect(messages).toMatchObject([{ text: "Configure the original plugin" }])
      expect((yield* sessions.list({ parentID: parent.id })).data).toHaveLength(1)
      expect(yield* sessions.context(parent.id)).toEqual([])
    }),
  )

  for (const fixture of [
    {
      name: "native JSON",
      format: "json",
      command: { subagent: true, agent: "build", model: "test/override" },
      agent: "build",
      model: "override",
    },
    {
      name: "legacy Markdown",
      format: "markdown",
      command: { subtask: true, agent: "build" },
      agent: "build",
      model: "parent",
    },
    {
      name: "subagent mode by default",
      format: "json",
      command: { agent: "reviewer" },
      agent: "reviewer",
      model: "child",
    },
  ] as const) {
    it.live(`runs ${fixture.name} in the background without switching the parent`, () =>
      Effect.gen(function* () {
        const parent = yield* project(fixture.command, fixture.format)
        const sessions = yield* Session.Service
        const llm = yield* TestLLM.Test
        const gate = yield* llm.gate()

        // This must return while the child's model is still blocked.
        yield* sessions.command({ sessionID: parent.id, command: "review", text: "changes" })
        yield* gate.started
        const children = (yield* sessions.list({ parentID: parent.id })).data
        expect(children).toHaveLength(1)
        const child = children[0]
        if (!child) return yield* Effect.die("Expected a child session")
        expect(child).toMatchObject({ agent: fixture.agent, model: { id: fixture.model }, title: "Review code" })
        expect(yield* sessions.get(parent.id)).toMatchObject({ agent: "build", model: parentModel })
        expect(yield* sessions.context(parent.id)).toEqual([])
        expect(yield* llm.requests()).toHaveLength(1)
        expect((yield* sessions.context(child.id)).filter((message) => message.type === "user")).toMatchObject([
          { text: "You are a subagent spawned by another session.\nReview changes: ready" },
        ])
        yield* gate.release
        yield* llm.wait(2)
        yield* sessions.wait(parent.id)
        const notices = (yield* sessions.context(parent.id)).filter((message) => message.type === "synthetic")
        expect(notices).toMatchObject([{ metadata: { source: "subagent", childID: child.id, state: "completed" } }])
        expect(notices[0]?.text).toContain("Review complete")
      }),
    )
  }

  it.live("subagent: false overrides subagent mode and the legacy alias", () =>
    Effect.gen(function* () {
      const parent = yield* project({ subagent: false, subtask: true, agent: "reviewer" }, "json")
      const sessions = yield* Session.Service
      yield* sessions.command({ sessionID: parent.id, command: "review", text: "changes" })
      yield* sessions.wait(parent.id)
      expect((yield* sessions.list({ parentID: parent.id })).data).toEqual([])
      expect(yield* sessions.get(parent.id)).toMatchObject({
        agent: "reviewer",
        model: { id: "child" },
      })
      expect((yield* sessions.context(parent.id)).filter((message) => message.type === "user")).toMatchObject([
        { text: "Review changes: ready" },
      ])
    }),
  )
})

function project(
  command: { agent?: string; model?: string; subagent?: boolean; subtask?: boolean },
  format: "json" | "markdown",
) {
  return Effect.gen(function* () {
    const tmp = yield* tmpdirScoped()
    const definition = { description: "Review code", template: "Review $ARGUMENTS: !`printf ready`", ...command }
    yield* Effect.promise(() =>
      Bun.write(
        path.join(tmp.path, "opencode.json"),
        JSON.stringify({
          agents: { reviewer: { mode: "subagent", model: "test/child" } },
          ...(format === "markdown" ? {} : { commands: { review: definition } }),
        }),
      ),
    )
    if (format === "markdown")
      yield* Effect.promise(() =>
        Bun.write(
          path.join(tmp.path, ".opencode/commands/review.md"),
          [
            "---",
            "description: Review code",
            ...Object.entries(command).map(([key, value]) => `${key}: ${value}`),
            "---",
            definition.template,
          ].join("\n"),
        ),
      )
    const sessions = yield* Session.Service
    return yield* sessions.create({
      location: { directory: AbsolutePath.make(tmp.path) },
      title: "Parent session",
      agent: Agent.ID.make("build"),
      model: parentModel,
    })
  })
}
