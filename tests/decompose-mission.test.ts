import { describe, expect, it } from "vitest";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import { decomposeMission } from "@/application/use-cases/visual-templates/agent-poc/decompose-mission";

const ADMIN = {
  id: "admin",
  role: "admin",
  organizationId: "org",
  isSuperAdmin: false,
} as const;

const valid = {
  schemaVersion: 1,
  reason: "Découper en lots vérifiables.",
  objectives: [
    {
      key: "global-theme",
      title: "Palette globale",
      goal: "Le thème global est bleu et blanc.",
      acceptanceCriteria: ["Le thème est appliqué."],
      evidence: [{ kind: "state", description: "Hash du thème." }],
      dependencies: [],
      constraints: ["Ne pas casser la lisibilité."],
    },
  ],
};

describe("décomposition de mission", () => {
  it("retourne une décomposition valide", async () => {
    let prompt = "";
    const result = await decomposeMission(
      {
        aiFactory: fixedAiClientFactory({
          async complete(input) {
            prompt = input.messages[0]?.content ?? "";
            return JSON.stringify(valid);
          },
        }),
      },
      ADMIN,
      { goal: "Refonte visuelle", constraints: ["Garder les contenus"] },
    );
    expect(result.objectives[0]?.key).toBe("global-theme");
    expect(prompt).toContain("Refonte visuelle");
    expect(prompt).toContain("one atomic plan");
  });

  it("refuse une décomposition non conforme au contrat", async () => {
    await expect(
      decomposeMission(
        {
          aiFactory: fixedAiClientFactory({
            complete: async () =>
              JSON.stringify({
                ...valid,
                objectives: [{ ...valid.objectives[0], acceptanceCriteria: [] }],
              }),
          }),
        },
        ADMIN,
        { goal: "Refonte visuelle", constraints: [] },
      ),
    ).rejects.toThrow();
  });
});
