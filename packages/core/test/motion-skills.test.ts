import { describe, expect, test } from "bun:test"
import { MotionSkills } from "../src/session/motion/index.js"
import { SessionRecentText } from "../src/session/recent-text.js"
import { SessionMessage } from "@opencode/schema/session-message"
import { Skill } from "@opencode/schema/skill"
import { DateTime } from "effect"

describe("automatic motion guidance", () => {
  test("selects UI references for a motion request", () => {
    const selection = MotionSkills.assess("Crie uma animação na interface React", 0, "msg_example")
    expect(selection?.guides).toEqual(["gsapReact"])
    expect(selection?.label).toMatch(/^OpenCodex Motion \w+$/)
    expect(MotionSkills.guidance({ opencodeMotion: selection })).toContain("GSAP")
  })
  test("combines video and UI references only when both are relevant", () => {
    expect(MotionSkills.assess("Anime um vídeo para a interface web", 0, "msg_one")?.guides).toEqual(["launchVideo", "gsapCore"])
    expect(MotionSkills.assess("Crie uma animação de vídeo", 0, "msg_two")?.guides).toEqual(["launchVideo"])
  })
  test("respects explicit skill selection and requests without motion", () => {
    expect(MotionSkills.assess("Crie uma animação", 1, "msg_one")).toBeUndefined()
    expect(MotionSkills.assess("Use a skill xyz para animar", 0, "msg_two")).toBeUndefined()
    expect(MotionSkills.assess("Quero uma tela sem animação", 0, "msg_three")).toBeUndefined()
    expect(MotionSkills.assess("Corrija o formulário", 0, "msg_four")).toBeUndefined()
  })
  test("ignores unknown metadata and never uses an unrecognized guide", () => {
    expect(MotionSkills.guidance({ opencodeMotion: { guides: ["unknown"] } })).toBeUndefined()
    expect(MotionSkills.guidance({ opencodeMotion: { guides: ["__proto__"] } })).toBeUndefined()
    expect(MotionSkills.guidance(undefined)).toBeUndefined()
  })
  test("validates the evaluator response before loading references", () => {
    expect(MotionSkills.parseSelection('{"guides":["gsapReact","remotion"]}')).toEqual(["gsapReact", "remotion"])
    expect(MotionSkills.parseSelection('{"guides":["unknown"]}')).toBeUndefined()
    expect(MotionSkills.parseSelection('{"guides":["gsapCore","gsapReact","effects"]}')).toBeUndefined()
    expect(MotionSkills.parseSelection("not JSON")).toBeUndefined()
    expect(MotionSkills.guidance({ opencodeMotion: { guides: ["remotion"] } })).toBeUndefined()
    expect(MotionSkills.guidance({ opencodeMotion: { guides: ["remotion"] } }, "private remotion reference")).toContain("private remotion reference")
  })
  test("folds steers in order and respects explicit skills and queued boundaries", () => {
    const user = (id: string, text: string, skillCount = 0, queued = false) => ({ type: "user" as const, id, text, skillCount, queued })
    expect(MotionSkills.assess("Anime a lista de skills", 0, "msg_list")).toBeDefined()
    expect(MotionSkills.active([user("msg_a", "Use esta skill", 1), user("msg_b", "Anime o botão")])).toBeUndefined()
    expect(MotionSkills.active([user("msg_a", "Não anime"), user("msg_b", "Mudei de ideia, anime o botão")])?.anchor.id).toBe("msg_b")
    expect(MotionSkills.active([user("msg_a", "Anime o botão"), user("msg_b", "Não anime")])).toBeUndefined()
    const selected = MotionSkills.active([user("msg_a", "Crie vídeo animado com Remotion"), user("msg_b", "A animação deve ser roxa")])
    expect(selected?.text).toContain("Remotion")
    expect(selected?.text).toContain("roxa")
    expect(MotionSkills.active([user("msg_a", "Anime o botão"), user("msg_b", "Explique o projeto", 0, true)])).toBeUndefined()
  })
  test("never adds automatic selection contents to compacted recent text", () => {
    const message = SessionMessage.Skill.make({ id: SessionMessage.ID.make("msg_motion"), type: "skill", skill: Skill.ID.make("opencodex-motion:msg_source"), name: Skill.Name.make("OpenCodex Motion Aura"), text: '{"guides":["gsapCore"]}', time: { created: DateTime.makeUnsafe(0) } })
    expect(SessionRecentText.messageToText(message)).toBe("")
  })
})
