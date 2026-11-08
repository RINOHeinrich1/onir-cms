import { describe, expect, it } from "vitest";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import { resolveDefaultStarterTemplate } from "@/application/use-cases/visual-templates/resolve-default-starter-template";

const starter = {
  id: "tpl-starter",
  key: "starter",
  name: "Starter",
  description: "",
  author: "ONIR",
  createdBy: null,
  createdAt: "",
  updatedAt: "",
};

function repository(overrides: Partial<VisualTemplateRepository> = {}): VisualTemplateRepository {
  return {
    findByKey: async () => starter,
    findAssignedById: async () => starter,
    listVersions: async () => [
      {
        id: "v-1",
        templateId: starter.id,
        version: "1.9.0",
        hostProtocol: "onirtech.template-host.v1",
        trustLevel: "official",
        mode: "iframe",
        entry: "index.html",
        integrity: "sha256-x",
        createdAt: "2026-01-01",
        manifest: {
          schemaVersion: 1,
          kind: "template",
          name: "Starter",
          version: "1.9.0",
          author: "ONIR",
          description: "",
          entry: "index.html",
          mode: "iframe",
          hostProtocol: "onirtech.template-host.v1",
          trustLevel: "official",
          capabilities: [],
          params: [
            {
              key: "primary_color",
              label: "Couleur principale",
              description: "",
              type: "color",
              default: "#000000",
            },
            {
              key: "title",
              label: "Titre",
              description: "",
              type: "string",
              default: "Défaut",
              maxLength: 80,
            },
          ],
          dataContracts: [],
        },
      },
      {
        id: "v-2",
        templateId: starter.id,
        version: "1.10.0",
        hostProtocol: "onirtech.template-host.v1",
        trustLevel: "official",
        mode: "iframe",
        entry: "index.html",
        integrity: "sha256-y",
        createdAt: "2026-02-01",
        manifest: {
          schemaVersion: 1,
          kind: "template",
          name: "Starter",
          version: "1.10.0",
          author: "ONIR",
          description: "",
          entry: "index.html",
          mode: "iframe",
          hostProtocol: "onirtech.template-host.v1",
          trustLevel: "official",
          capabilities: [],
          params: [
            {
              key: "primary_color",
              label: "Couleur principale",
              description: "",
              type: "color",
              default: "#111111",
            },
          ],
          dataContracts: [],
        },
      },
    ],
    ...overrides,
  } as unknown as VisualTemplateRepository;
}

describe("Starter par défaut", () => {
  it("sélectionne la dernière version installée", async () => {
    const result = await resolveDefaultStarterTemplate(repository(), "org-1");
    expect(result.template).toEqual({
      templateId: "tpl-starter",
      version: "1.10.0",
      params: { primary_color: "#111111" },
      colorParamKeys: ["primary_color"],
    });
    expect(result.warnings).toEqual([]);
  });

  it("revient au défaut si Starter n’est pas installé", async () => {
    const result = await resolveDefaultStarterTemplate(
      repository({ findByKey: async () => null }),
      "org-1",
    );
    expect(result.template).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("revient au défaut si Starter n’est pas assigné", async () => {
    const result = await resolveDefaultStarterTemplate(
      repository({ findAssignedById: async () => null }),
      "org-1",
    );
    expect(result.template).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });
});
