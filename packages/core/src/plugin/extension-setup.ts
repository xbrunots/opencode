export * as ExtensionSetupPlugin from "./extension-setup.js"

import { define } from "@opencode/plugin/effect/plugin"
import { SessionMessage } from "@opencode/schema/session-message"
import { Effect } from "effect"
import { Agent } from "../agent.js"
import { Config } from "../config.js"
import { Job } from "../job.js"
import { Permission } from "../permission.js"
import { Session } from "../session.js"
import { SessionSchema } from "../session/schema.js"
import { SubagentJob } from "../session/subagent-job.js"

const flows = ["mcp", "plugin", "skill"] as const

export const Plugin = define({
  id: "opencode.extension-setup",
  effect: Effect.fn(function* (ctx) {
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const permissions = yield* Permission.Service
    const config = yield* Config.Service
    const jobs = yield* Job.Service
    const subagents = yield* SubagentJob.Service

    yield* ctx.command.transform((editor) => {
      for (const flow of flows) {
        editor.add({
          name: `opencodex-${flow}`,
          description: `Configure ${flow} with a subagent`,
          execute: (input) =>
            Effect.gen(function* () {
              const parent = yield* sessions.get(input.sessionID)
              if (
                parent.parentID ||
                parent.metadata?.opencodexExtensionFlow !== flow ||
                parent.metadata?.opencodexExtensionRoot !== parent.id
              ) return yield* Effect.fail(new Error("Extension setup requires its dedicated session"))
              if ((Config.latest(yield* config.entries(), "experimental")?.subagent_depth ?? 1) < 1)
                return yield* Effect.fail(new Error("Subagent depth limit reached"))
              const agent = yield* agents.resolve("general")
              if (!agent || agent.mode === "primary") return yield* Effect.fail(new Error("Setup subagent is unavailable"))
              yield* permissions.assert({
                sessionID: parent.id,
                agent: parent.agent,
                action: "subagent",
                resources: [agent.id],
                save: [agent.id],
              })

              const id = SessionSchema.ID.make(`ses_opencodex_ext_${parent.id.slice(4)}`)
              const child = yield* sessions.create({
                id,
                parentID: parent.id,
                title: parent.title ?? `Configure ${flow}`,
                agent: agent.id,
                model: agent.model ?? parent.model,
              })
              if (child.parentID !== parent.id || child.metadata?.opencodexExtensionRoot !== parent.id)
                return yield* Effect.fail(new Error("Extension subagent belongs to a different session"))
              if (yield* jobs.get(child.id)) return
              const messageID = SessionMessage.ID.make(`msg_opencodex_ext_${parent.id.slice(4)}`)
              if (yield* sessions.message({ sessionID: child.id, messageID })) return
              yield* sessions.prompt({
                ...input.prompt,
                id: messageID,
                sessionID: child.id,
                text: [
                  input.prompt.text,
                  "You are a subagent spawned to help configure an OpenCodex extension. If more information is needed, ask in plain text and wait for the user's response. Do not call the question tool.",
                ].join("\n\n"),
                resume: false,
              })
              const recovery = {
                kind: "subagent" as const,
                parentSessionID: parent.id,
                childSessionID: child.id,
                agent: agent.name,
                description: parent.title ?? `Configure ${flow}`,
                notifyParent: false,
              }
              yield* subagents.start(recovery)
              yield* subagents.background(recovery)
            }).pipe(Effect.asVoid),
        })
      }
    })
  }),
})
