export * as MotionForkDelivery from "./fork-delivery.js"

import { and, asc, eq, inArray, lte, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { Database } from "../../database/database.js"
import { DatabaseBatch } from "../../database/batch.js"
import { EventTable } from "../../event/sql.js"
import { Bus } from "../../bus.js"
import { SessionEvent } from "../event.js"
import type { SessionInbox } from "../inbox.js"
import type { SessionMessage } from "../message.js"
import type { SessionSchema } from "../schema.js"
import { SessionMessageTable, SessionTable } from "../sql.js"

type DatabaseService = Database.Interface["db"]
type UserRow = { readonly id: SessionMessage.ID; readonly seq: number }

/** Internal envelope field used only when a fork copies a confirmed delivery mode. */
export const field = "__opencodeMotionDelivery"
const owner = "opencodex-fork-v1"

/** A marker belongs to exactly one projected row and never to arbitrary user metadata. */
export function isMarker(value: unknown, messageID: string) {
  if (typeof value !== "object" || value === null) return false
  if (!("owner" in value) || !("messageID" in value) || !("delivery" in value)) return false
  return value.owner === owner && value.messageID === messageID && (value.delivery === "queue" || value.delivery === "steer")
}

export const marker = (messageID: string, delivery: SessionInbox.Delivery) => ({ owner, messageID, delivery })

/** Resolve a copied user's last delivery without storing private markers in user metadata. */
export const resolve = Effect.fn("MotionForkDelivery.resolve")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  users: readonly UserRow[],
) {
  const modes = new Map<SessionMessage.ID, SessionInbox.Delivery>()
  const visited = new Set<SessionSchema.ID>()
  let current = sessionID
  let pending = users.map((row) => ({ target: row.id, id: row.id, seq: row.seq }))
  const enqueued = Bus.versionedType(SessionEvent.InboxEnqueued.type, 1)
  const changed = Bus.versionedType(SessionEvent.InboxDeliveryChanged.type, 1)

  while (pending.length && !visited.has(current)) {
    visited.add(current)
    const candidates = new Map(pending.map((item) => [item.id, item]))
    for (const ids of DatabaseBatch.batches([...candidates.keys()], 1, 2)) {
      const stored = yield* db.select({
        id: SessionMessageTable.id,
        marker: sql<string>`json_extract(${SessionMessageTable.data}, '$.__opencodeMotionDelivery')`,
      }).from(SessionMessageTable).where(and(
        eq(SessionMessageTable.session_id, current),
        eq(SessionMessageTable.type, "user"),
        inArray(SessionMessageTable.id, ids),
      )).all().pipe(Effect.orDie)
      stored.forEach((row) => {
        const candidate = candidates.get(row.id)
        if (!candidate || !row.marker) return
        const marker = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({
          owner: Schema.String,
          messageID: Schema.String,
          delivery: Schema.Literals(["queue", "steer"]),
        })))(row.marker)
        if (Option.isNone(marker) || !isMarker(marker.value, row.id)) return
        modes.set(candidate.target, marker.value.delivery)
      })
    }
    pending = pending.filter((item) => !modes.has(item.target))
    if (!pending.length) break
    const unresolved = new Map(pending.map((item) => [item.id, item]))
    const lastSequence = pending.reduce((max, item) => Math.max(max, item.seq), -1)
    for (const ids of DatabaseBatch.batches([...unresolved.keys()], 1, 4)) {
      const events = yield* db.select({
        id: sql<SessionMessage.ID>`json_extract(${EventTable.data}, '$.inboxID')`,
        delivery: sql<string>`coalesce(json_extract(${EventTable.data}, '$.delivery'), json_extract(${EventTable.data}, '$.item.delivery'))`,
        seq: EventTable.seq,
      }).from(EventTable).where(and(
        eq(EventTable.aggregate_id, current),
        inArray(EventTable.type, [enqueued, changed]),
        inArray(sql<SessionMessage.ID>`json_extract(${EventTable.data}, '$.inboxID')`, ids),
        lte(EventTable.seq, lastSequence),
      )).orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
      events.forEach((event) => {
        const candidate = unresolved.get(event.id)
        if (!candidate || event.seq > candidate.seq) return
        if (event.delivery !== "queue" && event.delivery !== "steer") return
        modes.set(candidate.target, event.delivery)
      })
    }
    pending = pending.filter((item) => !modes.has(item.target))
    if (!pending.length) break
    const fork = yield* db.select({ parent: SessionTable.fork_session_id, boundary: SessionTable.fork_boundary })
      .from(SessionTable).where(eq(SessionTable.id, current)).get().pipe(Effect.orDie)
    if (!fork?.parent || !fork.boundary || visited.has(fork.parent)) break
    const boundary = yield* db.select({ seq: SessionMessageTable.seq }).from(SessionMessageTable).where(and(
      eq(SessionMessageTable.session_id, fork.parent), eq(SessionMessageTable.id, fork.boundary.messageID),
    )).get().pipe(Effect.orDie)
    if (!boundary) break
    const limit = boundary.seq - (fork.boundary.type === "before" ? 1 : 0)
    const eligible = pending.filter((item) => item.seq <= limit)
    const copied = new Map<number, SessionMessage.ID>()
    for (const seqs of DatabaseBatch.batches(eligible.map((item) => item.seq), 1, 2)) {
      const parents = yield* db.select({ id: SessionMessageTable.id, seq: SessionMessageTable.seq })
        .from(SessionMessageTable).where(and(
          eq(SessionMessageTable.session_id, fork.parent),
          eq(SessionMessageTable.type, "user"),
          inArray(SessionMessageTable.seq, seqs),
        )).all().pipe(Effect.orDie)
      parents.forEach((item) => copied.set(item.seq, item.id))
    }
    pending = eligible.flatMap((item) => {
      const id = copied.get(item.seq)
      return id ? [{ ...item, id }] : []
    })
    current = fork.parent
  }
  return modes
})
