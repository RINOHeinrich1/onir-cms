import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyDataBindings } from "@/application/use-cases/links/link-data-bindings";
import {
  type LinkTemplateDependencies,
  loadTemplateSpec,
} from "@/application/use-cases/visual-templates/link-template";
import { loadTemplateData } from "@/application/use-cases/visual-templates/load-template-data";
import type { ChatLink } from "@/domain/entities/chat";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgLinkDataBindingRepository } from "@/infrastructure/db/link-data-binding-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { pgTemplateDataAuditRepository } from "@/infrastructure/db/template-data-audit-repository";
import { pgTemplateDataBindingRepository } from "@/infrastructure/db/template-data-binding-repository";
import {
  createTemplateQueryExecutor,
  type TemplateQueryExecutorHandle,
} from "@/infrastructure/db/template-query-executor";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { clearTemplateDataCache } from "@/lib/template-data-cache";
import {
  makeOrganization,
  provisionTemplateReader,
  setupDb,
  templateReaderUrl,
} from "./helpers/db";

const MANIFEST = {
  ui: { element: "runtime-template" },
  capabilities: ["messages", "data"],
  params: [],
  dataContracts: [
    {
      key: "library",
      label: "Bibliothèque",
      description: "",
      version: 1,
      loading: "lazy",
      inputs: [],
      schema: {
        type: "object",
        required: ["books"],
        properties: {
          books: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "title"],
              properties: { id: { type: "string" }, title: { type: "string" } },
            },
          },
        },
      },
    },
  ],
};

describe("runtime des ressources de données (ADR-0026)", () => {
  let pool: Pool;
  let executor: TemplateQueryExecutorHandle;
  let orgA: string;
  let orgB: string;
  let link: ChatLink;
  let deps: LinkTemplateDependencies;
  let templateId: string;
  let versionId: string;

  beforeAll(async () => {
    pool = await setupDb();
    await provisionTemplateReader(pool);
    executor = createTemplateQueryExecutor({ connectionString: templateReaderUrl() });

    orgA = await makeOrganization(pool, "Org runtime A");
    orgB = await makeOrganization(pool, "Org runtime B");
    await pool.query(
      `INSERT INTO base_connaissances (organization_id, titre, contenu, template_keys)
       VALUES ($1, 'Alpha', 'a', '{}'), ($1, 'Beta', 'b', '{}'), ($2, 'Gamma', 'g', '{}')`,
      [orgA, orgB],
    );

    const template = await pool.query<{ id: string }>(
      `INSERT INTO visual_templates (key, name, author) VALUES ('runtime-tpl', 'Runtime', 'tests') RETURNING id`,
    );
    templateId = template.rows[0]?.id ?? "";
    if (templateId === "") throw new Error("template de test non créé");
    const version = await pool.query<{ id: string }>(
      `INSERT INTO visual_template_versions
         (template_id, version, host_protocol, trust_level, mode, manifest, entry, integrity)
       VALUES ($1, '1.0.0', 'onirtech.template-host.v1', 'official', 'web-component', $2::jsonb, 'index.js',
               'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')
       RETURNING id`,
      [templateId, JSON.stringify(MANIFEST)],
    );
    versionId = version.rows[0]?.id ?? "";
    if (versionId === "") throw new Error("version de test non créée");

    const created = await pool.query<{ id: string }>(
      `INSERT INTO chat_links
         (token_hash, type, organization_id, visual_template_id, visual_template_version)
       VALUES ('runtime-hash', 'standard', $1, $2, '1.0.0')
       RETURNING id`,
      [orgA, templateId],
    );
    const linkId = created.rows[0]?.id;
    if (!linkId) throw new Error("lien de test non créé");

    await pool.query(
      `INSERT INTO template_data_bindings
         (organization_id, template_version_id, contract_key, query_text, root_path, max_rows, enabled, cache_ttl_seconds)
       VALUES ($1, $2, 'library',
               'SELECT id, titre AS title FROM template_read.v_connaissances WHERE actif ORDER BY titre',
               'books', 200, true, 0)`,
      [orgA, versionId],
    );

    const createdLink = await pgChatLinkRepository(pool).findById(orgA, linkId);
    if (createdLink === null) throw new Error("lien de test non relu");
    link = createdLink;

    deps = {
      visualTemplates: pgVisualTemplateRepository(pool),
      medias: pgMediaRepository(pool),
      templates: pgChatTemplateRepository(pool),
    };
  });

  afterAll(async () => {
    await executor.close();
    await pool.end();
  });

  it("charge, assemble et valide la ressource liée", async () => {
    clearTemplateDataCache();
    const spec = await loadTemplateSpec(deps, link);
    expect(spec).not.toBeNull();
    if (spec === null) return;
    expect(spec.dataContracts).toHaveLength(1);

    const result = await loadTemplateData(
      {
        bindings: pgTemplateDataBindingRepository(pool),
        executor,
        audit: pgTemplateDataAuditRepository(pool),
      },
      { link, spec, contractKey: "library" },
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toEqual({
      books: [
        { id: expect.any(String), title: "Alpha" },
        { id: expect.any(String), title: "Beta" },
      ],
    });

    const audit = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM template_data_audit WHERE organization_id = $1",
      [orgA],
    );
    expect(Number(audit.rows[0]?.count)).toBeGreaterThanOrEqual(1);
  });

  it("applique la surcharge du lien (binding prioritaire)", async () => {
    clearTemplateDataCache();
    const version = await pool.query<{ id: string }>(
      `SELECT v.id FROM visual_template_versions v JOIN visual_templates t ON t.id = v.template_id
        WHERE t.key = 'runtime-tpl' AND v.version = '1.0.0'`,
    );
    const versionId = version.rows[0]?.id;
    if (!versionId) throw new Error("version absente");
    const override = await pool.query<{ id: string }>(
      `INSERT INTO template_data_bindings
         (organization_id, template_version_id, contract_key, name, query_text, root_path, max_rows, enabled, cache_ttl_seconds, is_default)
       VALUES ($1, $2, 'library', 'Majuscules',
               'SELECT id, upper(titre) AS title FROM template_read.v_connaissances WHERE actif ORDER BY titre',
               'books', 200, true, 0, false)
       RETURNING id`,
      [orgA, versionId],
    );
    const overrideId = override.rows[0]?.id;
    if (!overrideId) throw new Error("binding de surcharge absent");
    await pool.query(
      `INSERT INTO chat_link_data_bindings (chat_link_id, contract_key, binding_id)
       VALUES ($1, 'library', $2)`,
      [link.id, overrideId],
    );

    const spec = await loadTemplateSpec(deps, link);
    if (spec === null) throw new Error("spec absente");
    const result = await loadTemplateData(
      { bindings: pgTemplateDataBindingRepository(pool), executor },
      { link, spec, contractKey: "library" },
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      const books = (result.data as { books: { title: string }[] }).books;
      expect(books.map((book) => book.title)).toEqual(["ALPHA", "BETA"]);
    }
  });

  it("upsertDefault crée puis incrémente la révision", async () => {
    const repo = pgTemplateDataBindingRepository(pool);
    const version = await pool.query<{ id: string }>(
      `SELECT v.id FROM visual_template_versions v JOIN visual_templates t ON t.id = v.template_id
        WHERE t.key = 'runtime-tpl' AND v.version = '1.0.0'`,
    );
    const versionId = version.rows[0]?.id;
    if (!versionId) throw new Error("version absente");
    const input = {
      organizationId: orgA,
      templateVersionId: versionId,
      contractKey: "library_upsert",
      queryText: "SELECT 1 AS id",
      rootPath: "books",
      rootKey: "id",
      children: [],
      queryInputs: [],
      invalidateOn: "none" as const,
      cacheTtlSeconds: 60,
      maxRows: 10,
      enabled: false,
      actorId: null,
    };
    const created = await repo.upsertDefault(input);
    expect(created.revision).toBe(1);
    const updated = await repo.upsertDefault({ ...input, maxRows: 20 });
    expect(updated.revision).toBe(2);
    expect(updated.maxRows).toBe(20);
    const defaults = await repo.listDefaults(orgA, versionId);
    expect(defaults.some((entry) => entry.contractKey === "library_upsert")).toBe(true);
  });

  it("refuse une surcharge d'une autre organisation (trigger)", async () => {
    const version = await pool.query<{ id: string }>(
      `SELECT v.id FROM visual_template_versions v JOIN visual_templates t ON t.id = v.template_id
        WHERE t.key = 'runtime-tpl' AND v.version = '1.0.0'`,
    );
    const versionId = version.rows[0]?.id;
    if (!versionId) throw new Error("version absente");
    const other = await pool.query<{ id: string }>(
      `INSERT INTO template_data_bindings
         (organization_id, template_version_id, contract_key, query_text, root_path, enabled)
       VALUES ($1, $2, 'library_other', 'SELECT 1 AS id', 'books', true)
       RETURNING id`,
      [orgB, versionId],
    );
    const otherId = other.rows[0]?.id;
    if (!otherId) throw new Error("binding d'une autre organisation absent");

    await expect(
      pool.query(
        `INSERT INTO chat_link_data_bindings (chat_link_id, contract_key, binding_id)
         VALUES ($1, 'library_other', $2)`,
        [link.id, otherId],
      ),
    ).rejects.toThrow(/organisation/);
  });

  it("choisit une variante par lien, puis bascule le défaut", async () => {
    const bindings = pgTemplateDataBindingRepository(pool);
    const linkDataBindings = pgLinkDataBindingRepository(pool);
    const applyDeps = {
      bindings,
      linkDataBindings,
      visualTemplates: deps.visualTemplates,
    };

    const variant = await bindings.create({
      organizationId: orgA,
      templateVersionId: versionId,
      contractKey: "library",
      name: "Variante",
      queryText: "SELECT id, 'Variante' AS title FROM template_read.v_connaissances WHERE actif",
      rootPath: "books",
      rootKey: "id",
      children: [],
      queryInputs: [],
      invalidateOn: "none",
      cacheTtlSeconds: 0,
      maxRows: 200,
      enabled: true,
      actorId: null,
    });
    expect(variant.isDefault).toBe(false);

    await applyDataBindings(applyDeps, link, { library: variant.id });
    expect(await linkDataBindings.list(link.id)).toEqual({ library: variant.id });

    const effective = await bindings.findEffective({
      organizationId: orgA,
      templateVersionId: versionId,
      linkId: link.id,
      contractKey: "library",
    });
    expect(effective?.id).toBe(variant.id);

    await applyDataBindings(applyDeps, link, { library: null });
    expect(await linkDataBindings.list(link.id)).toEqual({});
    const backToDefault = await bindings.findEffective({
      organizationId: orgA,
      templateVersionId: versionId,
      linkId: link.id,
      contractKey: "library",
    });
    expect(backToDefault?.isDefault).toBe(true);

    await bindings.setDefault(orgA, variant.id);
    const defaultNow = await bindings.findDefault({
      organizationId: orgA,
      templateVersionId: versionId,
      contractKey: "library",
    });
    expect(defaultNow?.id).toBe(variant.id);

    await expect(applyDataBindings(applyDeps, link, { library: randomUUID() })).rejects.toThrow();
    expect(await bindings.countLinkUsages(variant.id)).toBe(0);
    expect(templateId).not.toBe("");
  });

  it("relit les enfants après création et accepte l'ancienne forme camelCase", async () => {
    const repo = pgTemplateDataBindingRepository(pool);
    const created = await repo.create({
      organizationId: orgA,
      templateVersionId: versionId,
      contractKey: "children_roundtrip",
      name: "Enfants",
      queryText: "SELECT 1 AS id",
      rootPath: "books",
      rootKey: "id",
      children: [{ path: "pages", queryText: "SELECT 1", foreignKey: "book_id" }],
      queryInputs: [],
      invalidateOn: "none",
      cacheTtlSeconds: 0,
      maxRows: 10,
      enabled: false,
      actorId: null,
    });
    const read = await repo.findById(orgA, created.id);
    expect(read?.children).toEqual([
      { path: "pages", queryText: "SELECT 1", foreignKey: "book_id" },
    ]);
    const raw = await pool.query<{ children: unknown }>(
      "SELECT children FROM template_data_bindings WHERE id = $1",
      [created.id],
    );
    expect(raw.rows[0]?.children).toEqual([
      { path: "pages", query_text: "SELECT 1", foreign_key: "book_id" },
    ]);

    await pool.query("UPDATE template_data_bindings SET children = $1::jsonb WHERE id = $2", [
      JSON.stringify([{ path: "pages", queryText: "SELECT 2", foreignKey: "legacy_id" }]),
      created.id,
    ]);
    const legacy = await repo.findById(orgA, created.id);
    expect(legacy?.children).toEqual([
      { path: "pages", queryText: "SELECT 2", foreignKey: "legacy_id" },
    ]);
  });

  it("supprime une source et promeut une autre si c'était le défaut", async () => {
    const repo = pgTemplateDataBindingRepository(pool);
    const base = {
      organizationId: orgA,
      templateVersionId: versionId,
      contractKey: "cleanup",
      queryText: "SELECT 1 AS id",
      rootPath: "books",
      rootKey: "id",
      children: [],
      queryInputs: [],
      invalidateOn: "none" as const,
      cacheTtlSeconds: 0,
      maxRows: 10,
      enabled: false,
      actorId: null,
    };
    const first = await repo.create({ ...base, name: "A" });
    const second = await repo.create({ ...base, name: "B" });
    await repo.setDefault(orgA, first.id);
    const removed = await repo.deleteWithPromotion(orgA, first.id);
    expect(removed).toEqual({ deleted: true, promotedId: second.id });
    const promoted = await repo.findDefault({
      organizationId: orgA,
      templateVersionId: versionId,
      contractKey: "cleanup",
    });
    expect(promoted?.id).toBe(second.id);

    const last = await repo.deleteWithPromotion(orgA, second.id);
    expect(last).toEqual({ deleted: true, promotedId: null });
  });
});
