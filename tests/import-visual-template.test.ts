import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { MediaStorage } from "@/application/ports/media-storage";
import type {
  VisualTemplate,
  VisualTemplateAsset,
  VisualTemplateRepository,
  VisualTemplateVersion,
} from "@/application/ports/visual-template-repository";
import { importVisualTemplate } from "@/application/use-cases/visual-templates/import-template";
import { zipTemplateArchive } from "@/infrastructure/archive/zip-template-archive";
import { nodeTemplateHasher } from "@/infrastructure/crypto/sha256";

const ADMIN = { id: "u1", role: "admin", organizationId: "org-1", isSuperAdmin: true } as const;

const ENTRY = "export const x = 1;\n";
const ENTRY_SRI = `sha256-${createHash("sha256").update(Buffer.from(ENTRY)).digest("base64")}`;

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: "template",
    id: "aurora",
    name: "Aurora",
    description: "",
    version: "1.0.0",
    publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
    compatibility: { hostProtocol: "onirtech.template-host.v1" },
    ui: {
      mode: "web-component",
      entry: "./index.js",
      element: "onirtech-template-aurora",
      integrity: ENTRY_SRI,
      shadowDom: "open",
    },
    capabilities: ["messages"],
    network: [],
    ...overrides,
  };
}

function zip(files: Record<string, string>): Buffer {
  const archive = zipSync(
    Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(content)])),
  );
  return Buffer.from(archive);
}

function repo(): VisualTemplateRepository {
  const templates: VisualTemplate[] = [];
  const versions: VisualTemplateVersion[] = [];
  const assets: VisualTemplateAsset[] = [];
  return {
    list: async () => templates,
    listForOrganization: async () => templates,
    findAssignedById: async (_organizationId, id) =>
      templates.find((item) => item.id === id) ?? null,
    listAvailableForOrganization: async () => templates,
    listOwnedByOrganization: async () =>
      templates.filter((item) => item.ownerOrganizationId !== null),
    findByIdForOrganization: async (_organizationId, id) =>
      templates.find((item) => item.id === id) ?? null,
    findPlatformByKey: async (key) =>
      templates.find(
        (item) => item.ownerOrganizationId === null && item.key.toLowerCase() === key.toLowerCase(),
      ) ?? null,
    findByKeyForOrganization: async (_organizationId, key) =>
      templates.find((item) => item.key.toLowerCase() === key.toLowerCase()) ?? null,
    findInstallation: async () => null,
    countOwnedByOrganization: async (organizationId) =>
      templates.filter((item) => item.ownerOrganizationId === organizationId).length,
    countLinkUsages: async () => 0,
    listAllPlatformIds: async () =>
      templates.filter((item) => item.ownerOrganizationId === null).map((item) => item.id),
    assignAllToOrganization: async () => undefined,
    assignToAllOrganizations: async () => undefined,
    install: async (organizationId, templateId) => ({
      organizationId,
      templateId,
      installedBy: null,
      installedAt: new Date(0).toISOString(),
      source: "organization_upload" as const,
    }),
    uninstall: async () => false,
    findById: async (id) => templates.find((item) => item.id === id) ?? null,
    findByKey: async (key) =>
      templates.find((item) => item.key.toLowerCase() === key.toLowerCase()) ?? null,
    listVersions: async (templateId) => versions.filter((v) => v.templateId === templateId),
    findVersion: async (templateId, version) =>
      versions.find((v) => v.templateId === templateId && v.version === version) ?? null,
    findVersionForOrganization: async (_organizationId, templateId, version) =>
      versions.find((v) => v.templateId === templateId && v.version === version) ?? null,
    findAsset: async (versionId, path) =>
      assets.find((a) => a.versionId === versionId && a.path === path) ?? null,
    createTemplate: async (input) => {
      const now = new Date(0).toISOString();
      const template: VisualTemplate = {
        id: `tpl-${templates.length + 1}`,
        key: input.key,
        name: input.name,
        description: input.description,
        author: input.author,
        ownerOrganizationId: input.ownerOrganizationId ?? null,
        uploadedBy: input.uploadedBy ?? null,
        disabledAt: null,
        disabledBy: null,
        disabledReason: null,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      };
      templates.push(template);
      return template;
    },
    createVersion: async (input) => {
      const version: VisualTemplateVersion = {
        id: `ver-${versions.length + 1}`,
        templateId: input.templateId,
        version: input.version,
        hostProtocol: input.hostProtocol,
        trustLevel: input.trustLevel,
        mode: input.mode,
        manifest: input.manifest,
        entry: input.entry,
        integrity: input.integrity,
        healthStatus: "unknown",
        lastCheckedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastErrorDetail: null,
        disabledAt: null,
        disabledBy: null,
        disabledReason: null,
        createdAt: new Date(0).toISOString(),
      };
      versions.push(version);
      return version;
    },
    addAsset: async (input) => {
      const asset: VisualTemplateAsset = { id: `as-${assets.length + 1}`, ...input };
      assets.push(asset);
      return asset;
    },
    setDisabled: async () => null,
    getVersionUsage: async (templateId, version) => {
      const target = versions.find(
        (item) => item.templateId === templateId && item.version === version,
      );
      return {
        links: 0,
        bindings: 0,
        assets:
          target === undefined ? 0 : assets.filter((item) => item.versionId === target.id).length,
      };
    },
    setVersionDisabled: async (templateId, version, disabled, actorId, reason) => {
      const target = versions.find(
        (item) => item.templateId === templateId && item.version === version,
      );
      if (target === undefined) return null;
      return {
        ...target,
        disabledAt: disabled ? new Date(0).toISOString() : null,
        disabledBy: disabled ? actorId : null,
        disabledReason: disabled ? reason : null,
      };
    },
    deleteVersion: async (templateId, version) => {
      const index = versions.findIndex(
        (item) => item.templateId === templateId && item.version === version,
      );
      if (index < 0) return { deleted: false, assetKeys: [] };
      const [removed] = versions.splice(index, 1);
      if (removed === undefined) return { deleted: false, assetKeys: [] };
      const assetKeys = assets
        .filter((item) => item.versionId === removed.id)
        .map((item) => item.storageKey);
      for (let cursor = assets.length - 1; cursor >= 0; cursor -= 1) {
        if (assets[cursor]?.versionId === removed.id) assets.splice(cursor, 1);
      }
      return { deleted: true, assetKeys };
    },
    deleteTemplate: async (id) => {
      const index = templates.findIndex((item) => item.id === id);
      if (index < 0) return false;
      templates.splice(index, 1);
      return true;
    },
  };
}

function memoryStorage(): { storage: MediaStorage; count: () => number } {
  const files = new Map<string, Buffer>();
  let n = 0;
  return {
    storage: {
      save: async ({ data }) => {
        const key = `k-${++n}`;
        files.set(key, data);
        return key;
      },
      read: async (key) => {
        const data = files.get(key);
        return data === undefined ? null : { data, contentType: "application/octet-stream" };
      },
      remove: async (key) => {
        files.delete(key);
      },
    },
    count: () => files.size,
  };
}

function deps() {
  const mem = memoryStorage();
  return {
    deps: {
      templates: repo(),
      storage: mem.storage,
      archive: zipTemplateArchive(),
      hasher: nodeTemplateHasher(),
    },
    files: mem.count,
  };
}

describe("importVisualTemplate — US-TEMPLATE-001", () => {
  it("importe un bundle valide (manifeste + entry + assets)", async () => {
    const base = deps();
    const data = zip({
      "onirtech.template.json": JSON.stringify(manifest()),
      "index.js": ENTRY,
      "style.css": "body{color:red}",
    });
    const result = await importVisualTemplate(base.deps, ADMIN, { data });
    expect(result.template.key).toBe("aurora");
    expect(result.version.version).toBe("1.0.0");
    expect(result.version.mode).toBe("web-component");
    expect(base.files()).toBe(3);
  });

  it("refuse une intégrité SRI qui ne correspond pas à l'entrée", async () => {
    const base = deps();
    const data = zip({
      "onirtech.template.json": JSON.stringify(manifest()),
      "index.js": "export const x = 2;", // ≠ ENTRY
    });
    await expect(importVisualTemplate(base.deps, ADMIN, { data })).rejects.toThrow(/intégrité/i);
  });

  it("compense un import interrompu sans laisser de version ni d'asset", async () => {
    const base = deps();
    let saved = 0;
    const original = base.deps.storage;
    base.deps.storage = {
      ...original,
      save: async (input) => {
        saved += 1;
        if (saved === 2) throw new Error("stockage indisponible");
        return original.save(input);
      },
    };
    const data = zip({
      "onirtech.template.json": JSON.stringify(manifest()),
      "index.js": ENTRY,
      "style.css": "body{color:red}",
    });

    await expect(importVisualTemplate(base.deps, ADMIN, { data })).rejects.toThrow(
      /stockage indisponible/i,
    );
    expect(await base.deps.templates.list()).toHaveLength(0);
    expect(base.files()).toBe(0);
  });

  it("refuse de réinstaller une version déjà publiée (immuable)", async () => {
    const base = deps();
    const data = zip({
      "onirtech.template.json": JSON.stringify(manifest()),
      "index.js": ENTRY,
    });
    await importVisualTemplate(base.deps, ADMIN, { data });
    await expect(importVisualTemplate(base.deps, ADMIN, { data })).rejects.toThrow(/déjà/i);
  });

  it("rejette un chemin d'archive dangereux", async () => {
    const base = deps();
    const data = zip({
      "onirtech.template.json": JSON.stringify(manifest()),
      "index.js": ENTRY,
      "../evil.js": "hack",
    });
    await expect(importVisualTemplate(base.deps, ADMIN, { data })).rejects.toThrow(/interdit/i);
  });

  it("refuse un manifeste manquant", async () => {
    const base = deps();
    const data = zip({ "index.js": ENTRY });
    await expect(importVisualTemplate(base.deps, ADMIN, { data })).rejects.toThrow(/manifeste/i);
  });

  it("refuse un lecteur (RBAC visualtemplates:create)", async () => {
    const base = deps();
    const data = zip({
      "onirtech.template.json": JSON.stringify(manifest()),
      "index.js": ENTRY,
    });
    await expect(
      importVisualTemplate(
        base.deps,
        { id: "l1", role: "lecteur", organizationId: "org-1", isSuperAdmin: false },
        { data },
      ),
    ).rejects.toThrow(/super-administrateur/i);
  });
});
