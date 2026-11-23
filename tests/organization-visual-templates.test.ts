import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Actor } from "@/application/actor";
import {
  TemplateInUseError,
  TemplateKeyReservedError,
  TemplateLimitReachedError,
} from "@/application/errors";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import { importOrganizationVisualTemplate } from "@/application/use-cases/visual-templates/import-organization-template";
import {
  installVisualTemplateForOrganization,
  uninstallVisualTemplateForOrganization,
} from "@/application/use-cases/visual-templates/install-visual-template";

const ACTOR: Actor = {
  id: "user-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

const TEMPLATE = {
  id: "tpl-1",
  key: "maquette",
  name: "Maquette",
  description: "",
  author: "org",
  ownerOrganizationId: null,
  uploadedBy: null,
  disabledAt: null,
  disabledBy: null,
  disabledReason: null,
  createdBy: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

function baseRepo(overrides: Partial<VisualTemplateRepository> = {}): VisualTemplateRepository {
  return {
    list: async () => [],
    listForOrganization: async () => [],
    listAvailableForOrganization: async () => [],
    listOwnedByOrganization: async () => [],
    findByIdForOrganization: async () => TEMPLATE,
    findAssignedById: async () => null,
    findPlatformByKey: async () => null,
    findByKeyForOrganization: async () => null,
    findInstallation: async () => null,
    countOwnedByOrganization: async () => 0,
    countLinkUsages: async () => 0,
    listAllPlatformIds: async () => [],
    assignAllToOrganization: async () => undefined,
    assignToAllOrganizations: async () => undefined,
    install: async (organizationId, templateId) => ({
      organizationId,
      templateId,
      installedBy: ACTOR.id,
      installedAt: "2026-01-01",
      source: "organization_admin",
    }),
    uninstall: async () => true,
    findById: async () => null,
    findByKey: async () => null,
    listVersions: async () => [],
    findVersion: async () => null,
    findVersionForOrganization: async () => null,
    findAsset: async () => null,
    createTemplate: async () => {
      throw new Error("non utilisé");
    },
    createVersion: async () => {
      throw new Error("non utilisé");
    },
    addAsset: async () => {
      throw new Error("non utilisé");
    },
    setDisabled: async () => null,
    getVersionUsage: async () => ({ links: 0, bindings: 0, assets: 0 }),
    setVersionDisabled: async () => null,
    deleteVersion: async () => ({ deleted: false, assetKeys: [] }),
    deleteTemplate: async () => false,
    ...overrides,
  };
}

const ENTRY = Buffer.from("console.log('ok')");
const MANIFEST = {
  schemaVersion: 1,
  kind: "template",
  id: "maquette",
  name: "Maquette",
  description: "",
  version: "1.0.0",
  publisher: { id: "org", name: "Org", trustLevel: "official" },
  compatibility: { hostProtocol: "onirtech.template-host.v1" },
  ui: {
    mode: "web-component",
    entry: "index.js",
    element: "onirtech-template-maquette",
    integrity: `sha256-${createHash("sha256").update(ENTRY).digest("base64")}`,
    shadowDom: "open",
  },
  capabilities: [],
  network: [],
};

describe("templates d'organisation", () => {
  it("bloque un 11e template propriétaire", async () => {
    const repo = baseRepo({ countOwnedByOrganization: async () => 10 });
    await expect(
      importOrganizationVisualTemplate(
        {
          templates: repo,
          storage: { save: async () => "x", read: async () => null, remove: async () => undefined },
          archive: { extract: async () => new Map() },
          hasher: { sha256Base64: () => "", sha256Hex: () => "" },
        },
        ACTOR,
        { data: Buffer.from("zip") },
      ),
    ).rejects.toBeInstanceOf(TemplateLimitReachedError);
  });

  it("refuse une clé plateforme réservée", async () => {
    const repo = baseRepo({ findPlatformByKey: async () => TEMPLATE });
    const files = new Map<string, Buffer>([
      ["onirtech.template.json", Buffer.from(JSON.stringify(MANIFEST))],
      ["index.js", ENTRY],
    ]);
    await expect(
      importOrganizationVisualTemplate(
        {
          templates: repo,
          storage: {
            save: async () => "orgs/org-1/x.js",
            read: async () => null,
            remove: async () => undefined,
          },
          archive: { extract: async () => files },
          hasher: {
            sha256Base64: () => createHash("sha256").update(ENTRY).digest("base64"),
            sha256Hex: () => createHash("sha256").update(ENTRY).digest("hex"),
          },
        },
        ACTOR,
        { data: Buffer.from("zip") },
      ),
    ).rejects.toBeInstanceOf(TemplateKeyReservedError);
  });

  it("bloque la désinstallation d'un template encore utilisé", async () => {
    const repo = baseRepo({ countLinkUsages: async () => 3 });
    await expect(
      uninstallVisualTemplateForOrganization({ templates: repo }, ACTOR, TEMPLATE.id),
    ).rejects.toBeInstanceOf(TemplateInUseError);
  });

  it("installe un template disponible dans l'organisation", async () => {
    const repo = baseRepo();
    const result = await installVisualTemplateForOrganization(
      { templates: repo },
      ACTOR,
      TEMPLATE.id,
    );
    expect(result.organizationId).toBe("org-1");
    expect(result.templateId).toBe("tpl-1");
  });
});
