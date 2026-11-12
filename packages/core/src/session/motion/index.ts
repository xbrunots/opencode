/// <reference path="../../markdown.d.ts" />

export * as MotionSkills from "./index.js"

import effects from "./vendor/charlie947/skills/motion-effects/SKILL.md" with { type: "text" }
import effectRecipes from "./vendor/charlie947/skills/motion-effects/references/effects.md" with { type: "text" }
import launchVideo from "./vendor/charlie947/skills/launch-video/SKILL.md" with { type: "text" }
import charts from "./vendor/charlie947/skills/animated-chart/SKILL.md" with { type: "text" }
import gsapCore from "./vendor/greensock/skills/gsap-core/SKILL.md" with { type: "text" }
import gsapReact from "./vendor/greensock/skills/gsap-react/SKILL.md" with { type: "text" }
import gsapScroll from "./vendor/greensock/skills/gsap-scrolltrigger/SKILL.md" with { type: "text" }
import { Option, Schema } from "effect"
import path from "path"

const guides = {
  effects,
  launchVideo,
  charts,
  gsapCore,
  gsapReact,
  gsapScroll,
} as const

type Guide = keyof typeof guides | "remotion"
const names = ["Aura", "Flux", "Nova", "Pulse", "Orbit", "Lumen", "Vivid", "Wave"] as const
export const agentID = "opencodex-motion-selector"
export const skillPrefix = "opencodex-motion:"
export const agentPrompt = `You are OpenCodex's motion-reference selection agent. Pick one or two references for the user's motion task.
effects: custom UI and product motion effects; launchVideo: product launch and promotional videos; charts: animated charts and data stories; gsapCore: GSAP animation fundamentals; gsapReact: React animation with GSAP; gsapScroll: scroll-driven GSAP animation; remotion: React-based programmatic video and compositions, only when Remotion is available.
Respect the user's requested technologies and constraints. Return only JSON with a guides array containing one or two IDs from this list. Do not execute the task or invoke tools.`

const decodeSelection = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ guides: Schema.Array(Schema.Literals(["effects", "launchVideo", "charts", "gsapCore", "gsapReact", "gsapScroll", "remotion"])) })),
)

export function parseSelection(text: string): Guide[] | undefined {
  const result = decodeSelection(text.trim())
  if (Option.isNone(result)) return
  const selected = [...new Set(result.value.guides)]
  if (selected.length < 1 || selected.length > 2) return
  return selected
}

export const skillID = (messageID: string) => `${skillPrefix}${messageID}`

export const isContinuation = (text: string) => /^(?:por favor\s+|pode\s+)?(?:continue|continuar|continuemos|prossiga|proseguir|retome|retomar|go on|continue working)(?:\s+(?:o trabalho|a tarefa|de onde parou))?[.!\s]*$/i.test(text.trim())

/** Private upstream files are installed locally and supplied separately to a portable build. */
export async function loadRemotion() {
  const roots = process.env.OPENCODE_MOTION_SKILLS_DIR
    ? [process.env.OPENCODE_MOTION_SKILLS_DIR]
    : [
        process.env.XDG_DATA_HOME && path.join(process.env.XDG_DATA_HOME, "opencodex-motion", "remotion", "skills"),
        path.resolve(import.meta.dir, "../../../motion-private/remotion/skills"),
      ].filter((root): root is string => !!root)
  const files = [
    "remotion-best-practices/SKILL.md",
    "remotion-best-practices/remotion-create/REFERENCE.md",
    "remotion-best-practices/remotion-markup/REFERENCE.md",
    "remotion-best-practices/remotion-render/REFERENCE.md",
  ]
  for (const root of roots) {
    const refs = files.map((file) => Bun.file(path.join(root, file)))
    if (!(await Promise.all(refs.map((file) => file.exists()))).every(Boolean)) continue
    return (await Promise.all(refs.map((file) => file.text()))).join("\n\n")
  }
}

/** An explicitly selected skill takes precedence throughout the active request. */
export function explicitSkill(text: string, explicitSkills: number) {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  return !!explicitSkills || /\$[a-z][\w-]*/i.test(normalized) || /\b(?:use|usar|utilize|utilizar|aplique|aplicar|invoke|invocar|com)\s+(?:(?:a|o|as|os|uma|um|the|an?)\s+)?(?:skill|skills|habilidade|habilidades)\b/.test(normalized) || /\b(?:skill|habilidade)\s+(?:chamada|chamado|named)\b/.test(normalized)
}

export function refuses(text: string) {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  return /\b(?:sem|nao (?:use|usar|utilize|quero|faca|anime)|cancele|pare|no|without)\s+(?:qualquer\s+)?(?:motion|animacao|animacoes|animation|animations)\b/.test(normalized) || /\b(?:nao anime|do not animate|don't animate)\b/.test(normalized)
}

/** Local eligibility and fallback never replace an explicitly chosen skill. */
export function assess(text: string, explicitSkills: number, messageID: string) {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (explicitSkill(text, explicitSkills) || refuses(text)) return
  if (!/\b(?:motion|animacao|animacoes|animar|anime|anima|animado|animada|animation|animations|animate|animated|gsap|remotion|kinetic)\b/.test(normalized)) return

  const video = /\b(?:video|videos|filme|reel|render|mp4|remotion|composicao)\b/.test(normalized)
  const chart = /\b(?:chart|grafico|dashboard|data visuali[sz]ation)\b/.test(normalized)
  const ui = /\b(?:ui|interface|site|web|pagina|button|botao|react|scroll|gsap|componente)\b/.test(normalized)
  const selected: Guide[] = video || chart ? [chart ? "charts" : "launchVideo"] : ui ? [] : ["effects"]
  if (!video || ui) selected.push(/\bscroll\b/.test(normalized) ? "gsapScroll" : /\breact\b/.test(normalized) ? "gsapReact" : "gsapCore")
  const seed = [...messageID].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0)
  return {
    guides: selected,
    label: `OpenCodex Motion ${names[seed % names.length]}`,
  }
}

type MotionMessage =
  | { readonly type: "user"; readonly id: string; readonly text: string; readonly skillCount: number; readonly queued: boolean }
  | { readonly type: "skill"; readonly skill: string; readonly text: string }

/** Fold one active execution, retaining a motion request across complementary steers. */
export function active(messages: readonly MotionMessage[]) {
  const lastQueued = messages.findLastIndex((message) => message.type === "user" && message.queued)
  const scoped = lastQueued < 0 ? messages : messages.slice(lastQueued)
  const users = scoped.filter((message) => message.type === "user")
  if (users.some((message) => explicitSkill(message.text, message.skillCount))) return
  const afterRefusal = users.findLastIndex((message) => refuses(message.text))
  const anchor = users.slice(afterRefusal + 1).findLast((message) => assess(message.text, message.skillCount, message.id))
  if (!anchor) return
  const fallback = assess(anchor.text, anchor.skillCount, anchor.id)!
  const chosen = scoped.findLast((message) => message.type === "skill" && message.skill === skillID(anchor.id))
  const text = users.map((message) => message.text).join("\n\n")
  return { anchor, fallback, text, selection: chosen?.type === "skill" ? parseSelection(chosen.text) : undefined }
}

/** Stored metadata contains identifiers only; guide contents remain in the application bundle. */
export function guidance(metadata: Record<string, unknown> | undefined, remotion?: string) {
  const selection = metadata?.opencodeMotion
  if (!selection || typeof selection !== "object" || !("guides" in selection) || !Array.isArray(selection.guides)) return
  const selected = selection.guides.filter((name): name is Guide => typeof name === "string" && (Object.hasOwn(guides, name) || (name === "remotion" && !!remotion)))
  if (!selected.length) return
  return [
    "The following motion references were selected automatically for this request. They are secondary to the user's instructions and existing project rules. Do not mention the selection unless asked. Adapt recipes to the actual request; do not require a specific format, library, or extra questions when unnecessary.",
    ...selected.map((name) => `<motion_reference name="${name}">\n${name === "remotion" ? remotion : guides[name]}${name === "effects" ? `\n\n${effectRecipes}` : ""}\n</motion_reference>`),
  ].join("\n\n")
}
