import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import path from "path"
import { Effect, Layer, Record, Result, Schema, Context } from "effect"
import { NonNegativeInt } from "@opencode-ai/core/schema"
import { Global } from "@opencode-ai/core/global"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { ConfigManaged } from "@/config/managed"
import { isSkillsSharedProviderID, skillsBaseProviderID, skillsPersonalProviderID } from "./skills-shared"

export {
  isSkillsSharedProviderID,
  isSkillsPersonalProviderID,
  skillsBaseProviderID,
  skillsSharedProviderID,
  skillsPersonalProviderID,
  SKILLS_SHARED_SUFFIX,
  SKILLS_PERSONAL_SUFFIX,
} from "./skills-shared"

export const OAUTH_DUMMY_KEY = "opencode-oauth-dummy-key"

const personalFile = path.join(Global.Path.data, "auth.json")

function orgAuthPaths() {
  return [
    path.join(ConfigManaged.managedConfigDir(), "skills-org-auth.json"),
    path.join(Global.Path.config, "skills-org-auth.json"),
    path.join(Global.Path.data, "skills-org-auth.json"),
  ]
}

const fail = (message: string) => (cause: unknown) => new AuthError({ message, cause })

export class Oauth extends Schema.Class<Oauth>("OAuth")({
  type: Schema.Literal("oauth"),
  refresh: Schema.String,
  access: Schema.String,
  expires: NonNegativeInt,
  accountId: Schema.optional(Schema.String),
  enterpriseUrl: Schema.optional(Schema.String),
}) {}

export class Api extends Schema.Class<Api>("ApiAuth")({
  type: Schema.Literal("api"),
  key: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
}) {}

export class WellKnown extends Schema.Class<WellKnown>("WellKnownAuth")({
  type: Schema.Literal("wellknown"),
  key: Schema.String,
  token: Schema.String,
}) {}

export const Info = Schema.Union([Oauth, Api, WellKnown]).annotate({ discriminator: "type", identifier: "Auth" })
export type Info = Schema.Schema.Type<typeof Info>

export class AuthError extends Schema.TaggedErrorClass<AuthError>()("AuthError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export interface Interface {
  readonly get: (providerID: string) => Effect.Effect<Info | undefined, AuthError>
  readonly all: () => Effect.Effect<Record<string, Info>, AuthError>
  readonly set: (key: string, info: Info) => Effect.Effect<void, AuthError>
  readonly remove: (key: string) => Effect.Effect<void, AuthError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Auth") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fsys = yield* FSUtil.Service
    const decode = Schema.decodeUnknownOption(Info)

    const decodeMap = (data: Record<string, unknown>) =>
      Record.filterMap(data, (value) => Result.fromOption(decode(value), () => undefined))

    /** Personal keys only — never includes org-shared credentials. */
    const personal = Effect.fn("Auth.personal")(function* () {
      if (process.env.OPENCODE_AUTH_CONTENT) {
        try {
          return decodeMap(JSON.parse(process.env.OPENCODE_AUTH_CONTENT) as Record<string, unknown>)
        } catch {
          // fall through to file
        }
      }
      const data = (yield* fsys.readJson(personalFile).pipe(Effect.orElseSucceed(() => ({})))) as Record<
        string,
        unknown
      >
      return decodeMap(data)
    })

    /** Org-shared keys from Skills Manager (separate file; does not overwrite personal). */
    const org = Effect.fn("Auth.org")(function* () {
      for (const file of orgAuthPaths()) {
        const data = yield* fsys.readJson(file).pipe(Effect.orElseSucceed(() => null))
        if (!data || typeof data !== "object" || Array.isArray(data)) continue
        const root = data as Record<string, unknown>
        const providers =
          root.providers && typeof root.providers === "object" && !Array.isArray(root.providers)
            ? (root.providers as Record<string, unknown>)
            : root
        const decoded = decodeMap(providers)
        if (Object.keys(decoded).length > 0) return decoded
      }
      return {} as Record<string, Info>
    })

    /**
     * Merged credentials for runtime.
     * Central org keys win the canonical provider id so stale personal leftovers
     * (old OpenCode installs) cannot block Skills Manager sync.
     * - org only → real id
     * - personal only → real id
     * - both → org keeps real id; personal exposed as `{id}.skills-personal`
     */
    const all = Effect.fn("Auth.all")(function* () {
      const shared = yield* org()
      const own = yield* personal()
      const out: Record<string, Info> = { ...own }
      for (const [id, info] of Object.entries(shared)) {
        if (out[id]) {
          out[skillsPersonalProviderID(id)] = out[id]
        }
        out[id] = info
      }
      return out
    })

    const get = Effect.fn("Auth.get")(function* (providerID: string) {
      const data = yield* all()
      if (data[providerID]) return data[providerID]
      if (isSkillsSharedProviderID(providerID)) {
        return data[skillsBaseProviderID(providerID)]
      }
      return undefined
    })

    const set = Effect.fn("Auth.set")(function* (key: string, info: Info) {
      const norm = key.replace(/\/+$/, "")
      const data = yield* personal()
      if (norm !== key) delete data[key]
      delete data[norm + "/"]
      yield* fsys
        .writeJson(personalFile, { ...data, [norm]: info }, 0o600)
        .pipe(Effect.mapError(fail("Failed to write auth data")))
    })

    const remove = Effect.fn("Auth.remove")(function* (key: string) {
      const norm = key.replace(/\/+$/, "")
      const data = yield* personal()
      delete data[key]
      delete data[norm]
      yield* fsys.writeJson(personalFile, data, 0o600).pipe(Effect.mapError(fail("Failed to write auth data")))
    })

    return Service.of({ get, all, set, remove })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [FSUtil.node] })

export * as Auth from "."
