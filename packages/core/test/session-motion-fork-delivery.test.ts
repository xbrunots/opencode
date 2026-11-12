import { expect } from "bun:test"
import { and, asc, eq, sql } from "drizzle-orm"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { Location } from "@opencode/core/location"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { Project } from "@opencode/core/project"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionExecution } from "@opencode/core/session/execution"
import { SessionInbox } from "@opencode/core/session/inbox"
import { MotionForkDelivery } from "@opencode/core/session/motion/fork-delivery"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionMessageTable } from "@opencode/core/session/sql"
import { SessionStore } from "@opencode/core/session/store"
import { SessionTransfer } from "@opencode/core/session/transfer"
import { testEffect } from "./lib/effect"
import { promptLocationNode } from "./fixture/prompt-location"
import { globalProjectNode } from "./lib/project"

const it = testEffect(AppNodeBuilder.build(
  LayerNode.group([Database.node, Bus.node, SessionProjector.node, SessionStore.node, Session.node, SessionTransfer.node]),
  [
    Bus.node.replace(Bus.configured({ persist: true })),
    Project.node.replace(globalProjectNode),
    LocationServiceMap.node.replace(promptLocationNode),
    SessionExecution.node.replace(SessionExecution.noopLayer),
  ],
))

it.effect("resolves queued and steered prompts across forks while leaving imports unknown", () =>
  Effect.gen(function* () {
    const session = yield* Session.Service
    const transfer = yield* SessionTransfer.Service
    const bus = yield* Bus.Service
    const { db } = yield* Database.Service
    const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })
    const parent = yield* session.create({ location })
    const steer = yield* session.prompt({ sessionID: parent.id, text: "Steer", resume: false })
    const first = yield* session.prompt({ sessionID: parent.id, text: "First queue", delivery: "queue", resume: false })
    const second = yield* session.prompt({ sessionID: parent.id, text: "Second queue", delivery: "steer", resume: false })
    // The latest delivery-change event, not the initial admission, owns the final mode.
    yield* session.steerInbox({ sessionID: parent.id, inboxID: first.id })
    yield* session.queueInbox({ sessionID: parent.id, inboxID: first.id })
    yield* session.queueInbox({ sessionID: parent.id, inboxID: second.id })
    yield* SessionInbox.promote(db, bus, parent.id, "steer")
    yield* SessionInbox.promote(db, bus, parent.id, "input")
    yield* SessionInbox.promote(db, bus, parent.id, "input")

    const rows = (id: Session.ID) => db.select({ id: SessionMessageTable.id, seq: SessionMessageTable.seq })
      .from(SessionMessageTable).where(and(eq(SessionMessageTable.session_id, id), eq(SessionMessageTable.type, "user")))
      .orderBy(asc(SessionMessageTable.seq)).all().pipe(Effect.orDie)
    const source = yield* rows(parent.id)
    const expected: Array<SessionInbox.Delivery | undefined> = ["steer", "queue", "queue"]
    const sourceModes = yield* MotionForkDelivery.resolve(db, parent.id, source)
    expect([steer.id, first.id, second.id].map((id) => sourceModes.get(id))).toEqual(expected)

    const child = yield* session.fork({ sessionID: parent.id })
    const childRows = yield* rows(child.id)
    const childModes = yield* MotionForkDelivery.resolve(db, child.id, childRows)
    expect(childRows.map((row) => childModes.get(row.id))).toEqual(expected)
    const grandchild = yield* session.fork({ sessionID: child.id })
    const grandRows = yield* rows(grandchild.id)
    const grandModes = yield* MotionForkDelivery.resolve(db, grandchild.id, grandRows)
    expect(grandRows.map((row) => grandModes.get(row.id))).toEqual(expected)

    // The copied modes outlive the parent, including its boundary message and event history.
    yield* session.remove(parent.id)
    const afterParentRemoval = yield* MotionForkDelivery.resolve(db, child.id, childRows)
    expect(childRows.map((row) => afterParentRemoval.get(row.id))).toEqual(expected)
    yield* session.remove(child.id)
    const afterRemoval = yield* MotionForkDelivery.resolve(db, grandchild.id, grandRows)
    expect(grandRows.map((row) => afterRemoval.get(row.id))).toEqual(expected)
    const descendant = yield* session.fork({ sessionID: grandchild.id })
    const descendantRows = yield* rows(descendant.id)
    const descendantModes = yield* MotionForkDelivery.resolve(db, descendant.id, descendantRows)
    expect(descendantRows.map((row) => descendantModes.get(row.id))).toEqual(expected)

    const exported = yield* transfer.export({ sessionID: grandchild.id })
    expect(JSON.stringify(exported)).not.toContain(MotionForkDelivery.field)
    yield* session.remove(grandchild.id)
    yield* transfer.import({ data: exported, location })
    expect((yield* MotionForkDelivery.resolve(db, grandchild.id, yield* rows(grandchild.id))).size).toBe(0)
  }),
)

it.effect("preserves an existing envelope field and treats it conservatively", () =>
  Effect.gen(function* () {
    const session = yield* Session.Service
    const bus = yield* Bus.Service
    const { db } = yield* Database.Service
    const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })
    const parent = yield* session.create({ location })
    yield* session.prompt({
      sessionID: parent.id,
      text: "Queued",
      delivery: "queue",
      metadata: { [MotionForkDelivery.field]: "user metadata" },
      resume: false,
    })
    yield* SessionInbox.promote(db, bus, parent.id, "input")
    const row = yield* db.select().from(SessionMessageTable)
      .where(and(eq(SessionMessageTable.session_id, parent.id), eq(SessionMessageTable.type, "user")))
      .get().pipe(Effect.orDie)
    if (!row) return yield* Effect.die(new Error("Missing prompt"))
    yield* db.update(SessionMessageTable).set({ data: sql`json_set(${SessionMessageTable.data}, '$.__opencodeMotionDelivery', 'queue')` })
      .where(eq(SessionMessageTable.id, row.id)).run().pipe(Effect.orDie)
    const child = yield* session.fork({ sessionID: parent.id })
    const copied = yield* db.select().from(SessionMessageTable)
      .where(and(eq(SessionMessageTable.session_id, child.id), eq(SessionMessageTable.type, "user")))
      .get().pipe(Effect.orDie)
    expect(copied?.data).toMatchObject({ [MotionForkDelivery.field]: "queue", metadata: { [MotionForkDelivery.field]: "user metadata" } })
    if (!copied) return yield* Effect.die(new Error("Missing copied prompt"))
    expect((yield* MotionForkDelivery.resolve(db, child.id, [copied])).get(copied.id)).toBe("queue")
    yield* session.remove(parent.id)
    expect((yield* MotionForkDelivery.resolve(db, child.id, [copied])).has(copied.id)).toBe(false)
  }),
)
