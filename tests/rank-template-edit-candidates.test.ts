import { describe, expect, it } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import { rankTemplateEditCandidates } from "@/application/use-cases/visual-templates/rank-template-edit-candidates";
import {
  listTemplateEditCandidates,
  resolveTemplateEditTarget,
} from "@/domain/template-edit-resolver";
import {
  templateEditEditor as editor,
  templateEditValues as values,
} from "./fixtures/template-edit-fixture";

const ADMIN = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

function aiReturning(content: string): AiClient {
  return { complete: async () => content };
}

describe("classement sémantique des cibles d'édition", () => {
  it("retrouve une cible par synonymie quand le lexical ne trouve rien", async () => {
    const request = "supprime la section nous connaître";
    const resolved = resolveTemplateEditTarget({
      request,
      currentPageId: "about",
      editor,
      values,
    });
    expect(resolved.candidates).toEqual([]);

    const candidates = listTemplateEditCandidates({
      request,
      currentPageId: "about",
      editor,
      values,
    });
    expect(candidates.some((candidate) => candidate.itemId === "about_text")).toBe(true);

    const ai = aiReturning(
      JSON.stringify({
        selectedId: "blocks:about_text",
        confidence: "high",
        ranking: [
          { id: "blocks:about_text", score: 0.96, reason: "« nous connaître » = « À propos »" },
          { id: "blocks:theme_btn", score: 0.08 },
        ],
      }),
    );
    const result = await rankTemplateEditCandidates(
      { aiFactory: fixedAiClientFactory(ai) },
      ADMIN,
      { request, page: resolved.page, candidates },
    );

    expect(result.status).toBe("selected");
    if (result.status !== "selected") return;
    expect(result.candidate.itemId).toBe("about_text");
  });

  it("refuse un identifiant inventé par l'IA", async () => {
    const request = "change le fond du bouton";
    const resolved = resolveTemplateEditTarget({
      request,
      currentPageId: "home",
      editor,
      values,
    });
    const ai = aiReturning(
      JSON.stringify({
        selectedId: "blocks:ghost",
        confidence: "high",
        ranking: [{ id: "blocks:ghost", score: 1, reason: "inventé" }],
      }),
    );
    const result = await rankTemplateEditCandidates(
      { aiFactory: fixedAiClientFactory(ai) },
      ADMIN,
      { request, page: resolved.page, candidates: resolved.candidates },
    );

    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") return;
    expect(result.question).toContain("J’ai trouvé plusieurs cibles");
    expect(result.candidates.some((candidate) => candidate.itemId === "ghost")).toBe(false);
  });

  it("sélectionne directement une cible unique sans appeler l'IA", async () => {
    const request = "modifie le bouton Parler à notre assistant";
    const resolved = resolveTemplateEditTarget({
      request,
      currentPageId: "home",
      editor,
      values,
    });
    const unique = resolved.candidates.slice(0, 1);
    const ai: AiClient = {
      complete: async () => {
        throw new Error("ne doit pas être appelé");
      },
    };
    const result = await rankTemplateEditCandidates(
      { aiFactory: fixedAiClientFactory(ai) },
      ADMIN,
      { request, page: resolved.page, candidates: unique },
    );

    expect(result.status).toBe("selected");
    if (result.status !== "selected") return;
    expect(result.candidate.itemId).toBe("hero_button");
  });
});
