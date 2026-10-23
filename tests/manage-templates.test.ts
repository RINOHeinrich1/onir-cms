import { describe, expect, it, vi } from "vitest";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import { createTemplate } from "@/application/use-cases/templates/create-template";
import { deleteTemplate } from "@/application/use-cases/templates/delete-template";
import { updateTemplate } from "@/application/use-cases/templates/update-template";
import type {
  ChatTemplate,
  ChatTemplateVersion,
  TemplateDefinition,
} from "@/domain/entities/chat-template";

const ACTOR = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

const DEFINITION: TemplateDefinition = {
  key: "demo",
  label: "Démo",
  description: "",
  systemPrompt: "x",
  fields: [{ name: "titre", label: "Titre", type: "text", required: true }],
  renderTemplate: "# {{titre}}",
};

function versioned(version: number): ChatTemplateVersion {
  return {
    id: `v${version}`,
    templateId: "t1",
    version,
    definition: DEFINITION,
    createdBy: "admin-1",
    createdAt: new Date(0).toISOString(),
  };
}

function repo(current: number, referenced: boolean) {
  return {
    findByKey: async () => null,
    findVersion: async () => null,
    currentVersion: async () => versioned(current),
    createTemplate: async () => versioned(1),
    addVersion: vi.fn(async () => versioned(current + 1)),
    deleteTemplate: vi.fn(async () => true),
    list: async () => [],
    listKeysReferencedByLinks: async () => (referenced ? ["demo"] : []),
    listKeysReferencedByFiches: async () => [],
  } satisfies ChatTemplateRepository;
}

describe("versioning des modèles", () => {
  it("createTemplate → v1", async () => {
    const links = repo(1, false);
    const created = await createTemplate(
      { templates: links },
      ACTOR,
      JSON.parse(JSON.stringify(DEFINITION)),
    );
    expect(created.version).toBe(1);
  });

  it("updateTemplate → vN+1", async () => {
    const links = repo(2, false);
    const updated = await updateTemplate(
      { templates: { ...links, findByKey: async () => ({}) as ChatTemplate } },
      ACTOR,
      "demo",
      JSON.parse(JSON.stringify(DEFINITION)),
    );
    expect(updated.version).toBe(3);
  });

  it("deleteTemplate refusé si référencé (ConflictError → 409)", async () => {
    const links = repo(1, true);
    await expect(
      deleteTemplate(
        { templates: { ...links, findByKey: async () => ({}) as ChatTemplate } },
        ACTOR,
        "demo",
      ),
    ).rejects.toThrow(/utilisé/);
  });
});
