import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import {
  TemplateVersionInUseError,
  TemplateVersionNotUninstallableError,
} from "@/application/errors";
import type {
  VisualTemplate,
  VisualTemplateRepository,
  VisualTemplateVersion,
  VisualTemplateVersionUsage,
} from "@/application/ports/visual-template-repository";
import {
  setVisualTemplateVersionDisabled,
  uninstallVisualTemplateVersion,
} from "@/application/use-cases/visual-templates/manage-visual-template-versions";

const ACTOR: Actor = {
  id: "user-1",
  role: "admin",
  organizationId: null,
  isSuperAdmin: true,
};

const TEMPLATE: VisualTemplate = {
  id: "tpl-1",
  key: "nutri-editorial",
  name: "Nutri Editorial",
  description: "",
  author: "onirtech",
  ownerOrganizationId: null,
  uploadedBy: null,
  disabledAt: null,
  disabledBy: null,
  disabledReason: null,
  createdBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function version(
  value: string,
  healthStatus: VisualTemplateVersion["healthStatus"],
  disabledAt: string | null = null,
): VisualTemplateVersion {
  return {
    id: `ver-${value}`,
    templateId: TEMPLATE.id,
    version: value,
    hostProtocol: "onirtech.template-host.v1",
    trustLevel: "official",
    mode: "web-component",
    manifest: {} as VisualTemplateVersion["manifest"],
    entry: "src/index.js",
    integrity: "sha256-integrity",
    healthStatus,
    lastCheckedAt: null,
    lastErrorCode: healthStatus === "error" ? "import_incomplete" : null,
    lastErrorMessage: healthStatus === "error" ? "Import incomplet" : null,
    lastErrorDetail: null,
    disabledAt,
    disabledBy: null,
    disabledReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function repo(
  initialVersions: VisualTemplateVersion[],
  usage: VisualTemplateVersionUsage,
): {
  repo: VisualTemplateRepository;
  versions: VisualTemplateVersion[];
  usage: VisualTemplateVersionUsage;
} {
  const versions = [...initialVersions];
  const state = { links: usage.links, bindings: usage.bindings, assets: usage.assets };
  const repository: VisualTemplateRepository = {
    list: async () => [TEMPLATE],
    listForOrganization: async () => [TEMPLATE],
    listAvailableForOrganization: async () => [],
    listOwnedByOrganization: async () => [],
    findByIdForOrganization: async () => TEMPLATE,
    findAssignedById: async () => TEMPLATE,
    findPlatformByKey: async () => TEMPLATE,
    findByKeyForOrganization: async () => TEMPLATE,
    findInstallation: async () => null,
    countOwnedByOrganization: async () => 0,
    countLinkUsages: async () => 0,
    listAllPlatformIds: async () => [TEMPLATE.id],
    assignAllToOrganization: async () => undefined,
    assignToAllOrganizations: async () => undefined,
    install: async () => {
      throw new Error("non utilisé");
    },
    uninstall: async () => false,
    findById: async () => TEMPLATE,
    findByKey: async () => TEMPLATE,
    listVersions: async () => versions,
    findVersion: async (_templateId, value) =>
      versions.find((item) => item.version === value) ?? null,
    findVersionForOrganization: async (_organizationId, _templateId, value) =>
      versions.find((item) => item.version === value) ?? null,
    getVersionUsage: async () => ({ ...state }),
    setVersionDisabled: async (_templateId, value, disabled, actorId, reason) => {
      const index = versions.findIndex((item) => item.version === value);
      const current = versions[index];
      if (current === undefined) return null;
      const updated: VisualTemplateVersion = {
        ...current,
        disabledAt: disabled ? "2026-01-02T00:00:00.000Z" : null,
        disabledBy: disabled ? actorId : null,
        disabledReason: disabled ? reason : null,
      };
      versions[index] = updated;
      return updated;
    },
    deleteVersion: async (_templateId, value) => {
      const index = versions.findIndex((item) => item.version === value);
      if (index < 0) return { deleted: false, assetKeys: [] };
      versions.splice(index, 1);
      return {
        deleted: true,
        assetKeys: state.assets > 0 ? ["asset-key-1"] : [],
      };
    },
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
    deleteTemplate: async () => false,
  };
  return { repo: repository, versions, usage: state };
}

function storage() {
  return { save: vi.fn(), read: vi.fn(), remove: vi.fn(async () => undefined) };
}

describe("cycle de vie des versions", () => {
  it("désinstalle une version en erreur sans usage", async () => {
    const fake = repo([version("1.3.3", "error"), version("1.3.2", "ok")], {
      links: 0,
      bindings: 0,
      assets: 0,
    });
    const media = storage();
    const audit = { record: vi.fn(async () => undefined) };

    const result = await uninstallVisualTemplateVersion(
      { templates: fake.repo, storage: media, audit },
      ACTOR,
      TEMPLATE.id,
      "1.3.3",
    );

    expect(result.usage).toEqual({ links: 0, bindings: 0, assets: 0 });
    expect(fake.versions.map((item) => item.version)).toEqual(["1.3.2"]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "version_uninstalled",
        metadata: expect.objectContaining({ version: "1.3.3" }),
      }),
    );
  });

  it("refuse une version saine non désactivée", async () => {
    const fake = repo([version("1.3.3", "ok"), version("1.3.2", "ok")], {
      links: 0,
      bindings: 0,
      assets: 2,
    });
    await expect(
      uninstallVisualTemplateVersion(
        { templates: fake.repo, storage: storage() },
        ACTOR,
        TEMPLATE.id,
        "1.3.3",
      ),
    ).rejects.toBeInstanceOf(TemplateVersionNotUninstallableError);
  });

  it("refuse une version encore utilisée par un lien", async () => {
    const fake = repo([version("1.3.3", "error"), version("1.3.2", "ok")], {
      links: 1,
      bindings: 0,
      assets: 0,
    });
    await expect(
      uninstallVisualTemplateVersion(
        { templates: fake.repo, storage: storage() },
        ACTOR,
        TEMPLATE.id,
        "1.3.3",
      ),
    ).rejects.toBeInstanceOf(TemplateVersionInUseError);
  });

  it("refuse la dernière version du template", async () => {
    const fake = repo([version("1.3.3", "error")], {
      links: 0,
      bindings: 0,
      assets: 0,
    });
    await expect(
      uninstallVisualTemplateVersion(
        { templates: fake.repo, storage: storage() },
        ACTOR,
        TEMPLATE.id,
        "1.3.3",
      ),
    ).rejects.toBeInstanceOf(TemplateVersionNotUninstallableError);
  });

  it("désactive puis réactive une version avec audit", async () => {
    const fake = repo([version("1.3.3", "ok"), version("1.3.2", "ok")], {
      links: 0,
      bindings: 0,
      assets: 2,
    });
    const audit = { record: vi.fn(async () => undefined) };
    const deps = { templates: fake.repo, storage: storage(), audit };

    const disabled = await setVisualTemplateVersionDisabled(
      deps,
      ACTOR,
      TEMPLATE.id,
      "1.3.3",
      true,
      "Version cassée",
    );
    expect(disabled.disabledAt).not.toBeNull();

    const enabled = await setVisualTemplateVersionDisabled(
      deps,
      ACTOR,
      TEMPLATE.id,
      "1.3.3",
      false,
      null,
    );
    expect(enabled.disabledAt).toBeNull();
    expect(audit.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ event: "version_disabled" }),
    );
    expect(audit.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ event: "version_enabled" }),
    );
  });
});
