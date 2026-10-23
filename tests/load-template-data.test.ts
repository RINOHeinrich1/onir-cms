import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TemplateDataBindingRepository } from "@/application/ports/template-data-binding-repository";
import {
  TemplateQueryError,
  type TemplateQueryInput,
} from "@/application/ports/template-query-executor";
import {
  loadTemplateData,
  type TemplateDataDependencies,
} from "@/application/use-cases/visual-templates/load-template-data";
import type { TemplateDataContract } from "@/domain/data-contracts";
import type { ChatLink } from "@/domain/entities/chat";
import type { TemplateSpec } from "@/domain/template-contract";
import type { TemplateDataBinding } from "@/domain/template-data";
import { clearTemplateDataCache } from "@/lib/template-data-cache";

const contract: TemplateDataContract = {
  key: "library",
  label: "Bibliothèque",
  description: "",
  version: 1,
  loading: "lazy",
  inputs: [{ key: "book_id", type: "string", required: false }],
  schema: {
    type: "object",
    required: ["books"],
    additionalProperties: false,
    properties: {
      books: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "title", "pages"],
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string", maxLength: 20 },
            pages: {
              type: "array",
              items: {
                type: "object",
                required: ["index", "text"],
                additionalProperties: false,
                properties: { index: { type: "integer" }, text: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
};

const binding: TemplateDataBinding = {
  id: "binding-1",
  name: "Défaut",
  isDefault: true,
  organizationId: "org-1",
  templateVersionId: "version-1",
  contractKey: "library",
  provider: "sql",
  queryText: "SELECT id, title FROM template_read.v_books",
  rootPath: "books",
  rootKey: "id",
  children: [
    {
      path: "pages",
      queryText: "SELECT book_id, index, text FROM template_read.v_pages WHERE book_id = ANY($1)",
      foreignKey: "book_id",
    },
  ],
  queryInputs: [
    { index: 1, from: "input:book_id" },
    { index: 2, from: "link:max_items" },
    { index: 3, from: "system:locale" },
  ],
  invalidateOn: "none",
  cacheTtlSeconds: 60,
  maxRows: 100,
  enabled: true,
  revision: 3,
};

const link: ChatLink = {
  id: "link-1",
  organizationId: "org-1",
  label: "Lien",
  type: "standard",
  prospectId: null,
  createdBy: null,
  actif: true,
  expiresAt: null,
  templateKey: "modele",
  templateVersion: 1,
  sources: { connaissances: true, phototheque: true, lien: true },
  confidentialiteId: null,
  userStateEnabled: false,
  visualTemplateId: "template-1",
  visualTemplateVersion: "1.0.0",
  visualTemplateConfig: {},
  visualTemplateParams: {},
  aiProviderId: null,
  aiModel: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const spec: TemplateSpec = {
  id: "template-1",
  versionId: "version-1",
  version: "1.0.0",
  mode: "web-component",
  entryUrl: "/x.js",
  element: "x-template",
  capabilities: ["messages", "data"],
  params: [{ key: "max_items", label: "Max", description: "", type: "number", default: 3 }],
  dataContracts: [contract],
};

function fakeBindings(
  findEffective: () => Promise<TemplateDataBinding | null>,
): TemplateDataBindingRepository {
  return {
    findEffective: vi.fn(findEffective),
    findDefault: vi.fn(async () => null),
    listDefaults: vi.fn(async () => []),
    upsertDefault: vi.fn(async () => {
      throw new Error("non utilisé");
    }),
    listForVersion: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    create: vi.fn(async () => {
      throw new Error("non utilisé");
    }),
    updateById: vi.fn(async () => null),
    setDefault: vi.fn(async () => null),
    deleteWithPromotion: vi.fn(async () => ({ deleted: false, promotedId: null })),
    countLinkUsages: vi.fn(async () => 0),
  };
}

function deps(overrides: Partial<TemplateDataDependencies> = {}): TemplateDataDependencies {
  const calls: TemplateQueryInput[] = [];
  const executor = {
    execute: vi.fn(async (input: TemplateQueryInput) => {
      calls.push(input);
      if (Array.isArray(input.params?.[0])) {
        return {
          rows: [
            { book_id: "b1", index: 0, text: "Page 1" },
            { book_id: "b1", index: 1, text: "Page 2" },
          ],
          truncated: false,
          durationMs: 2,
          byteCount: 40,
        };
      }
      return {
        rows: [
          { id: "b1", title: "Titre" },
          { id: "b2", title: "Second" },
        ],
        truncated: false,
        durationMs: 3,
        byteCount: 30,
      };
    }),
  };
  const audit = { record: vi.fn(async () => undefined) };
  return {
    bindings: fakeBindings(async () => binding),
    executor,
    audit,
    ...overrides,
    // Conserve l'audit par défaut si l'override ne le remplace pas.
    ...(overrides.audit === undefined ? { audit } : {}),
  };
}

describe("loadTemplateData (ADR-0026 §5-§8)", () => {
  beforeEach(() => {
    clearTemplateDataCache();
    vi.clearAllMocks();
  });

  it("assemble la racine et les enfants et mappe les paramètres", async () => {
    const d = deps();
    const result = await loadTemplateData(d, { link, spec, contractKey: "library" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toEqual({
      books: [
        {
          id: "b1",
          title: "Titre",
          pages: [
            { index: 0, text: "Page 1" },
            { index: 1, text: "Page 2" },
          ],
        },
        { id: "b2", title: "Second", pages: [] },
      ],
    });
    expect(d.executor.execute).toHaveBeenCalledTimes(2);
    const rootCall = vi.mocked(d.executor.execute).mock.calls[0]?.[0];
    expect(rootCall?.params).toEqual([undefined, 3, "fr"]);
    const childCall = vi.mocked(d.executor.execute).mock.calls[1]?.[0];
    expect(childCall?.params).toEqual([["b1", "b2"]]);
    expect(result.meta.revision).toBe(3);
    expect(d.audit?.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: "ok" }));
  });

  it("sert la seconde demande depuis le cache", async () => {
    const d = deps();
    const first = await loadTemplateData(d, { link, spec, contractKey: "library" });
    const second = await loadTemplateData(d, { link, spec, contractKey: "library" });
    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    if (second.status === "ok") expect(second.meta.cached).toBe(true);
    expect(d.executor.execute).toHaveBeenCalledTimes(2);
    expect(d.audit?.record).toHaveBeenLastCalledWith(expect.objectContaining({ cacheHit: true }));
  });

  it("refuse un contrat inconnu et un binding absent", async () => {
    const unknown = await loadTemplateData(deps(), { link, spec, contractKey: "other" });
    expect(unknown).toMatchObject({ status: "error", code: "DATA_UNBOUND" });

    const missing = await loadTemplateData(deps({ bindings: fakeBindings(async () => null) }), {
      link,
      spec,
      contractKey: "library",
    });
    expect(missing).toMatchObject({ status: "error", code: "DATA_UNBOUND" });
  });

  it("refuse un binding désactivé et des entrées invalides", async () => {
    const disabled = await loadTemplateData(
      deps({ bindings: fakeBindings(async () => ({ ...binding, enabled: false })) }),
      { link, spec, contractKey: "library" },
    );
    expect(disabled).toMatchObject({ status: "error", code: "DATA_DISABLED" });

    const unknownInput = await loadTemplateData(deps(), {
      link,
      spec,
      contractKey: "library",
      inputs: { inconnu: 1 },
    });
    expect(unknownInput).toMatchObject({ status: "error", code: "DATA_INPUT_INVALID" });

    const badType = await loadTemplateData(deps(), {
      link,
      spec,
      contractKey: "library",
      inputs: { book_id: 42 },
    });
    expect(badType).toMatchObject({ status: "error", code: "DATA_INPUT_INVALID" });
  });

  it("refuse une sortie non conforme au contrat", async () => {
    const executor = {
      execute: vi.fn(async () => ({
        rows: [{ id: "b1", title: "x".repeat(21) }],
        truncated: false,
        durationMs: 1,
        byteCount: 20,
      })),
    };
    const result = await loadTemplateData(deps({ executor }), {
      link,
      spec,
      contractKey: "library",
    });
    expect(result).toMatchObject({ status: "error", code: "DATA_CONTRACT_INVALID" });
    if (result.status === "error") expect(result.fieldErrors?.length ?? 0).toBeGreaterThan(0);
  });

  it("mappe les erreurs du fournisseur", async () => {
    const executor = {
      execute: vi.fn(async () => {
        throw new TemplateQueryError("DATA_TIMEOUT", "délai dépassé");
      }),
    };
    const result = await loadTemplateData(deps({ executor }), {
      link,
      spec,
      contractKey: "library",
    });
    expect(result).toMatchObject({ status: "error", code: "DATA_TIMEOUT" });
  });

  it("aperçu : ignore enabled et n'écrit pas dans le cache", async () => {
    const d = deps({ bindings: fakeBindings(async () => ({ ...binding, enabled: false })) });
    const first = await loadTemplateData(d, { link, spec, contractKey: "library", preview: true });
    expect(first.status).toBe("ok");
    const second = await loadTemplateData(d, { link, spec, contractKey: "library", preview: true });
    expect(second.status).toBe("ok");
    if (second.status === "ok") expect(second.meta.cached).toBe(false);
    expect(d.executor.execute).toHaveBeenCalledTimes(4);
  });

  it("refuse un mapping de paramètres incohérent", async () => {
    const broken = { ...binding, queryInputs: [{ index: 2, from: "input:book_id" }] };
    const result = await loadTemplateData(deps({ bindings: fakeBindings(async () => broken) }), {
      link,
      spec,
      contractKey: "library",
    });
    expect(result).toMatchObject({ status: "error", code: "DATA_INPUT_INVALID" });
  });
});
