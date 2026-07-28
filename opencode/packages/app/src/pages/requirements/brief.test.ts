import { describe, expect, test } from "bun:test"
import { serializeRequirementBrief } from "./brief"
import { defaultDocumentMarkdown, parseDocumentSections } from "./document-template"
import type { RequirementProject } from "./types"

describe("requirement document template", () => {
  test("round-trips section bodies", () => {
    const markdown = defaultDocumentMarkdown({
      goal: "Login with SSO",
      pages: "Login page",
      interactions: "Click Continue",
      copy: "Welcome back",
      constraints: "Desktop only",
      acceptance: "User lands on home",
    })
    expect(parseDocumentSections(markdown)).toEqual({
      goal: "Login with SSO",
      pages: "Login page",
      interactions: "Click Continue",
      copy: "Welcome back",
      constraints: "Desktop only",
      acceptance: "User lands on home",
    })
  })
})

describe("serializeRequirementBrief", () => {
  test("includes title sections and asset notes", () => {
    const project: RequirementProject = {
      id: "1",
      title: "SSO Login",
      document: defaultDocumentMarkdown({
        goal: "Allow SSO login",
        pages: "Login",
        interactions: "",
        copy: "",
        constraints: "",
        acceptance: "Redirect home",
      }),
      assistantNotes: "Primary CTA is blue",
      integration: {
        envName: "test",
        baseUrl: "https://api-test.example.com",
        apifoxUrl: "https://app.apifox.com/project/1",
        apifoxProjectId: "1",
        apifoxAccessToken: "apifox-secret-should-not-leak",
        tapdUrl: "",
        tapdWorkspaceId: "",
        tapdStoryUrl: "",
        tapdAccessToken: "",
        notes: "Bearer from .env",
        apis: [
          {
            id: "api1",
            method: "POST",
            path: "/middle/pallet/config/list",
            name: "获取货盘配置列表",
          },
        ],
      },
      messages: [
        { id: "m1", role: "user", content: "Please analyze login.png", at: 1 },
        { id: "m2", role: "assistant", content: "Primary button is Continue with SSO", at: 2 },
        { id: "m3", role: "assistant", content: "Ignore this rambling reply", at: 3 },
      ],
      handoffMessageIds: ["m2"],
      assets: [
        {
          id: "a1",
          filename: "login.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,xx",
          note: "Desktop mock",
          createdAt: 1,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    }

    const brief = serializeRequirementBrief(project)
    expect(brief).toContain("SSO Login")
    expect(brief).toContain("Allow SSO login")
    expect(brief).toContain("1. [image] login.png — Desktop mock")
    expect(brief).not.toContain("Primary CTA is blue")
    expect(brief).toContain("Wait for my confirmation before implementing")
    expect(brief).toContain("Integration / 联调环境")
    expect(brief).toContain("https://api-test.example.com")
    expect(brief).toContain("https://app.apifox.com/project/1")
    expect(brief).toContain("project-id=1")
    expect(brief).toContain("获取货盘配置列表")
    expect(brief).toContain("/middle/pallet/config/list")
    expect(brief).not.toContain("apifox-secret-should-not-leak")
    expect(brief).toContain("Selected analysis excerpts")
    expect(brief).toContain("Primary button is Continue with SSO")
    expect(brief).not.toContain("Ignore this rambling reply")
    expect(brief).not.toContain("Please analyze login.png")

    const withNotes = serializeRequirementBrief(project, { includeAnalystNotes: true })
    expect(withNotes).toContain("Primary CTA is blue")

    const pagesOnly = serializeRequirementBrief(project, {
      sections: {
        goal: false,
        pages: true,
        interactions: false,
        copy: false,
        constraints: false,
        acceptance: false,
      },
      includeIntegration: false,
      includeAssets: false,
      includeAnalystNotes: false,
      messageIds: [],
    })
    expect(pagesOnly).toContain("### Pages / Screens")
    expect(pagesOnly).toContain("Login")
    expect(pagesOnly).not.toContain("### Goal")
    expect(pagesOnly).not.toContain("Allow SSO login")
    expect(pagesOnly).not.toContain("Integration / 联调环境")
    expect(pagesOnly).not.toContain("Selected analysis excerpts")
  })
})
