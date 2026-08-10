import { describe, expect, test } from "bun:test"
import {
  isSkillsPersonalProviderID,
  isSkillsSharedProviderID,
  skillsBaseProviderID,
  skillsPersonalProviderID,
  skillsSharedProviderID,
} from "../../src/auth/skills-shared"

describe("skills-shared provider ids", () => {
  test("base id strips shared and personal suffixes", () => {
    expect(skillsBaseProviderID("alibaba-cn")).toBe("alibaba-cn")
    expect(skillsBaseProviderID("alibaba-cn.skills-shared")).toBe("alibaba-cn")
    expect(skillsBaseProviderID("alibaba-cn.skills-personal")).toBe("alibaba-cn")
  })

  test("suffix helpers", () => {
    expect(isSkillsSharedProviderID("alibaba-cn.skills-shared")).toBe(true)
    expect(isSkillsPersonalProviderID("alibaba-cn.skills-personal")).toBe(true)
    expect(skillsSharedProviderID("alibaba-cn")).toBe("alibaba-cn.skills-shared")
    expect(skillsPersonalProviderID("alibaba-cn")).toBe("alibaba-cn.skills-personal")
  })
})
