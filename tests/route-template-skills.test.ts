import { describe, expect, it } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import type { LoadedTemplateSkill } from "@/application/ports/template-skill-loader";
import { routeTemplateSkills } from "@/application/use-cases/visual-templates/route-template-skills";
import { TEMPLATE_SKILL_FORMAT, type TemplateAiSkillV1 } from "@/domain/template-skill";

const ADMIN = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

function skill(id: string): LoadedTemplateSkill {
  const value: TemplateAiSkillV1 = {
    schemaVersion: 1,
    format: TEMPLATE_SKILL_FORMAT,
    id,
    title: id,
    description: `Skill ${id}`,
    version: "1.0.0",
    priority: 10,
    always: false,
    intents: [
      {
        id: "intent",
        description: "Une intention",
        keywords: [],
        examples: ["une demande"],
      },
    ],
    instructions: ["Faire quelque chose"],
    context: { include: [], maxCandidates: 8 },
    operations: { allowed: ["set"], constraints: [] },
    examples: [{ request: "une demande" }],
  };
  return {
    ref: {
      id,
      format: TEMPLATE_SKILL_FORMAT,
      path: `skills/${id}.json`,
      integrity: "sha256-aaaa",
    },
    skill: value,
  };
}

function aiReturning(content: string): AiClient {
  return { complete: async () => content };
}

describe("routage IA des skills", () => {
  it("ne retient que les IDs du catalogue", async () => {
    const skills = [skill("style"), skill("page")];
    const result = await routeTemplateSkills(
      {
        aiFactory: fixedAiClientFactory(
          aiReturning(
            JSON.stringify({
              skills: [
                { id: "style", confidence: 0.8, reason: "demande de style" },
                { id: "inventé", confidence: 0.9, reason: "inconnu" },
              ],
              clarification: null,
            }),
          ),
        ),
      },
      ADMIN,
      { request: "change le style", skills },
    );
    expect(result.skills.map((entry) => entry.skill.skill.id)).toEqual(["style"]);
    expect(result.candidates).toEqual(["style", "page"]);
  });

  it("retourne une clarification sans sélection", async () => {
    const result = await routeTemplateSkills(
      {
        aiFactory: fixedAiClientFactory(
          aiReturning(
            JSON.stringify({
              skills: [],
              clarification: "Voulez-vous modifier la page ou un bouton ?",
            }),
          ),
        ),
      },
      ADMIN,
      { request: "fais quelque chose", skills: [skill("style")] },
    );
    expect(result.skills).toEqual([]);
    expect(result.clarification).toContain("page ou un bouton");
  });

  it("ne consulte pas l'IA sans skills", async () => {
    const result = await routeTemplateSkills(
      {
        aiFactory: fixedAiClientFactory({
          complete: async () => {
            throw new Error("ne doit pas être appelé");
          },
        }),
      },
      ADMIN,
      { request: "test", skills: [] },
    );
    expect(result.skills).toEqual([]);
    expect(result.clarification).toBeNull();
  });
});
