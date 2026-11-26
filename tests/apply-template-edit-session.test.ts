import { describe, expect, it } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import type { TemplateEditAuditRepository } from "@/application/ports/template-edit-audit-repository";
import type { TemplateEditSessionRepository } from "@/application/ports/template-edit-session-repository";
import type { TemplateSkillLoader } from "@/application/ports/template-skill-loader";
import { applyTemplateEditSessionProposal } from "@/application/use-cases/visual-templates/template-edit-session";
import { hashTemplateEditValues } from "@/application/use-cases/visual-templates/template-edit-values-hash";
import {
  createTemplateEditSessionState,
  type TemplateEditSession,
} from "@/domain/template-edit-session";
import { puzzleV2Editor, puzzleV2Params, puzzleV2Values } from "./fixtures/puzzle-v2-reference";

const ADMIN = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

function values() {
  return JSON.parse(JSON.stringify(puzzleV2Values)) as typeof puzzleV2Values;
}

describe("application d’une session", () => {
  it("adopte les valeurs du planner sans réexécuter les insertions", async () => {
    const workingParams = values();
    const pendingValues = values();
    const card = (pendingValues.blocks as Array<Record<string, unknown>>).find(
      (item) => item.id === "card_one",
    );
    if (card === undefined) throw new Error("card_one absente");
    card.title = "Titre planifié";

    const base = createTemplateEditSessionState(workingParams);
    const session: TemplateEditSession = {
      id: "session-1",
      organizationId: "org-1",
      linkId: "link-1",
      createdBy: "admin-1",
      surface: "page",
      templateId: "template-1",
      templateVersion: "1.0.0",
      status: "active",
      state: {
        ...base,
        pendingProposal: {
          operations: [
            {
              op: "insert",
              target: { kind: "collection", collection: "pages" },
              values: { title: "Ne doit pas être insérée" },
            },
          ],
        },
        pendingValues,
        pendingBaseHash: hashTemplateEditValues(workingParams),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    let savedState = session;
    const sessions = {
      create: async () => session,
      find: async () => session,
      findActive: async () => session,
      save: async (_org, _link, _id, state) => {
        savedState = { ...session, state };
        return savedState;
      },
      archive: async () => true,
    } as TemplateEditSessionRepository;
    const audit: TemplateEditAuditRepository = {
      record: async () => undefined,
      listBySession: async () => [],
    };
    const ai: AiClient = {
      complete: async () => {
        throw new Error("ne doit pas appeler l’IA");
      },
    };

    const result = await applyTemplateEditSessionProposal(
      {
        sessions,
        aiFactory: fixedAiClientFactory(ai),
        audit,
        skillLoader: { load: async () => [] } as TemplateSkillLoader,
      },
      ADMIN,
      {
        linkId: "link-1",
        surface: "page",
        templateId: "template-1",
        templateVersion: "1.0.0",
        editor: puzzleV2Editor,
        schema: puzzleV2Params,
        workingParams,
      },
      "session-1",
    );

    expect(result.values.pages).toHaveLength((workingParams.pages as unknown[]).length);
    expect(result.values.blocks).toEqual(pendingValues.blocks);
    expect(savedState.state.pendingValues).toBeNull();
  });
});
