import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer, Context, Schema } from "effect"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Snapshot } from "@/snapshot"
import { Session } from "./session"
import { SessionID, MessageID } from "./schema"
import { Config } from "@/config/config"

function unquoteGitPath(input: string) {
  if (!input.startsWith('"')) return input
  if (!input.endsWith('"')) return input
  const body = input.slice(1, -1)
  const bytes: number[] = []

  for (let i = 0; i < body.length; i++) {
    const char = body[i]!
    if (char !== "\\") {
      bytes.push(char.charCodeAt(0))
      continue
    }

    const next = body[i + 1]
    if (!next) {
      bytes.push("\\".charCodeAt(0))
      continue
    }

    if (next >= "0" && next <= "7") {
      const chunk = body.slice(i + 1, i + 4)
      const match = chunk.match(/^[0-7]{1,3}/)
      if (!match) {
        bytes.push(next.charCodeAt(0))
        i++
        continue
      }
      bytes.push(parseInt(match[0], 8))
      i += match[0].length
      continue
    }

    const escaped =
      next === "n"
        ? "\n"
        : next === "r"
          ? "\r"
          : next === "t"
            ? "\t"
            : next === "b"
              ? "\b"
              : next === "f"
                ? "\f"
                : next === "v"
                  ? "\v"
                  : next === "\\" || next === '"'
                    ? next
                    : undefined

    bytes.push((escaped ?? next).charCodeAt(0))
    i++
  }

  return Buffer.from(bytes).toString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/** When shadow-git snapshots are empty/unavailable, recover diffs from tool metadata. */
function diffsFromToolParts(messages: SessionV1.WithParts[]): Snapshot.FileDiff[] {
  const byFile = new Map<string, Snapshot.FileDiff>()

  for (const item of messages) {
    if (item.info.role !== "assistant") continue
    for (const part of item.parts) {
      if (part.type !== "tool") continue
      if (part.state.status !== "completed") continue
      const metadata = part.state.metadata
      if (!isRecord(metadata)) continue

      const filediff = metadata.filediff
      if (isRecord(filediff) && typeof filediff.file === "string" && typeof filediff.patch === "string") {
        byFile.set(filediff.file, {
          file: filediff.file,
          patch: filediff.patch,
          additions: typeof filediff.additions === "number" ? filediff.additions : 0,
          deletions: typeof filediff.deletions === "number" ? filediff.deletions : 0,
          status:
            filediff.status === "added" || filediff.status === "deleted" || filediff.status === "modified"
              ? filediff.status
              : undefined,
        })
        continue
      }

      if (!Array.isArray(metadata.files)) continue
      for (const raw of metadata.files) {
        if (!isRecord(raw)) continue
        const file =
          typeof raw.relativePath === "string"
            ? raw.relativePath
            : typeof raw.filePath === "string"
              ? raw.filePath
              : undefined
        const patch = typeof raw.patch === "string" ? raw.patch : typeof raw.diff === "string" ? raw.diff : undefined
        if (!file || typeof patch !== "string") continue
        const status = raw.type === "add" ? "added" : raw.type === "delete" ? "deleted" : "modified"
        byFile.set(file, {
          file,
          patch,
          additions: typeof raw.additions === "number" ? raw.additions : 0,
          deletions: typeof raw.deletions === "number" ? raw.deletions : 0,
          status,
        })
      }
    }
  }

  return Array.from(byFile.values())
}

export interface Interface {
  readonly summarize: (input: { sessionID: SessionID; messageID: MessageID }) => Effect.Effect<void>
  readonly diff: (input: { sessionID: SessionID; messageID?: MessageID }) => Effect.Effect<Snapshot.FileDiff[]>
  readonly computeDiff: (input: { messages: SessionV1.WithParts[] }) => Effect.Effect<Snapshot.FileDiff[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionSummary") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const snapshot = yield* Snapshot.Service
    const events = yield* EventV2Bridge.Service
    const config = yield* Config.Service

    const computeDiff = Effect.fn("SessionSummary.computeDiff")(function* (input: { messages: SessionV1.WithParts[] }) {
      let from: string | undefined
      let to: string | undefined
      for (const item of input.messages) {
        if (!from) {
          for (const part of item.parts) {
            if (part.type === "step-start" && part.snapshot) {
              from = part.snapshot
              break
            }
          }
        }
        for (const part of item.parts) {
          if (part.type === "step-finish" && part.snapshot) to = part.snapshot
        }
      }
      if (from && to) {
        const full = yield* snapshot.diffFull(from, to)
        if (full.length) return full
      }
      return diffsFromToolParts(input.messages)
    })

    const summarize = Effect.fn("SessionSummary.summarize")(function* (input: {
      sessionID: SessionID
      messageID: MessageID
    }) {
      yield* sessions.setSummary({
        sessionID: input.sessionID,
        summary: {
          additions: 0,
          deletions: 0,
          files: 0,
        },
      })
      yield* events.publish(Session.Event.Diff, { sessionID: input.sessionID, diff: [] })
      const all = yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
      if (!all.length) return

      const messages = all.filter(
        (m) => m.info.id === input.messageID || (m.info.role === "assistant" && m.info.parentID === input.messageID),
      )
      const target = messages.find((m) => m.info.id === input.messageID)
      if (!target || target.info.role !== "user") return

      const snapshotEnabled = (yield* config.get()).snapshot !== false
      const msgDiffs = snapshotEnabled ? yield* computeDiff({ messages }) : diffsFromToolParts(messages)
      const additions = msgDiffs.reduce((sum, item) => sum + item.additions, 0)
      const deletions = msgDiffs.reduce((sum, item) => sum + item.deletions, 0)
      target.info.summary = {
        ...target.info.summary,
        diffs: msgDiffs,
      }
      yield* sessions.updateMessage(target.info)
      yield* sessions.setSummary({
        sessionID: input.sessionID,
        summary: {
          additions,
          deletions,
          files: msgDiffs.length,
        },
      })
      yield* events.publish(Session.Event.Diff, { sessionID: input.sessionID, diff: msgDiffs })
    })

    const diff = Effect.fn("SessionSummary.diff")(function* (input: { sessionID: SessionID; messageID?: MessageID }) {
      if (!input.messageID) return []
      const message = (yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)).find(
        (item) => item.info.id === input.messageID,
      )
      if (!message || message.info.role !== "user") return []
      const diffs = message.info.summary?.diffs ?? []
      return diffs.map((item) => {
        if (item.file === undefined) return item
        const file = unquoteGitPath(item.file)
        if (file === item.file) return item
        return { ...item, file }
      })
    })

    return Service.of({ summarize, diff, computeDiff })
  }),
)

export const DiffInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
})
export type DiffInput = Schema.Schema.Type<typeof DiffInput>

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Session.node, Snapshot.node, EventV2Bridge.node, Config.node],
})

export * as SessionSummary from "./summary"
