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
    listAllIds: async () => templates.map((item) => item.id),
    assignAllToOrganization: async () => undefined,
    assignToAllOrganizations: async () => undefined,
    unassign: async () => undefined,
    findById: async (id) => templates.find((item) => item.id === id) ?? null,
    findByKey: async (key) =>
      templates.find((item) => item.key.toLowerCase() === key.toLowerCase()) ?? null,
    listVersions: async (templateId) => versions.filter((v) => v.templateId === templateId),
    findVersion: async (templateId, version) =>
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
