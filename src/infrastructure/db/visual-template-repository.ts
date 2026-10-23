import type { Pool } from "pg";
import type {
  CreateVisualTemplateAssetInput,
  CreateVisualTemplateInput,
  CreateVisualTemplateVersionInput,
  VisualTemplate,
  VisualTemplateAsset,
  VisualTemplateRepository,
  VisualTemplateVersion,
} from "@/application/ports/visual-template-repository";
import type {
  TemplateManifest,
  TemplateMode,
  TemplateTrustLevel,
} from "@/domain/entities/visual-template";

type TemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  author: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

type VersionRow = {
  id: string;
  template_id: string;
  version: string;
  host_protocol: string;
  trust_level: string;
  mode: string;
  manifest: unknown;
  entry: string;
  integrity: string;
  created_at: Date;
};

type AssetRow = {
  id: string;
  version_id: string;
  path: string;
  storage_key: string;
  sha256: string;
  size: number;
  mime: string;
};

const TEMPLATE_COLUMNS = "id, key, name, description, author, created_by, created_at, updated_at";
const VERSION_COLUMNS =
  "id, template_id, version, host_protocol, trust_level, mode, manifest, entry, integrity, created_at";
const ASSET_COLUMNS = "id, version_id, path, storage_key, sha256, size, mime";

function toTemplate(row: TemplateRow): VisualTemplate {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    author: row.author,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toVersion(row: VersionRow): VisualTemplateVersion {
  return {
    id: row.id,
    templateId: row.template_id,
    version: row.version,
    hostProtocol: row.host_protocol,
    trustLevel: row.trust_level as TemplateTrustLevel,
    mode: row.mode as TemplateMode,
    manifest: row.manifest as TemplateManifest,
    entry: row.entry,
    integrity: row.integrity,
    createdAt: row.created_at.toISOString(),
  };
}

function toAsset(row: AssetRow): VisualTemplateAsset {
  return {
    id: row.id,
    versionId: row.version_id,
    path: row.path,
    storageKey: row.storage_key,
    sha256: row.sha256,
    size: row.size,
    mime: row.mime,
  };
}

/** Adapter PostgreSQL du port `VisualTemplateRepository`. */
export function pgVisualTemplateRepository(pool: Pool): VisualTemplateRepository {
  return {
    async list(): Promise<VisualTemplate[]> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS} FROM visual_templates ORDER BY lower(key)`,
      );
      return rows.map(toTemplate);
    },

    async listForOrganization(organizationId): Promise<VisualTemplate[]> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS.split(", ")
          .map((c) => `t.${c}`)
          .join(", ")}
           FROM visual_templates t
           JOIN organization_visual_templates ovt ON ovt.template_id = t.id
          WHERE ovt.organization_id = $1
          ORDER BY lower(t.key)`,
        [organizationId],
      );
      return rows.map(toTemplate);
    },

    async findAssignedById(organizationId, id): Promise<VisualTemplate | null> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS.split(", ")
          .map((c) => `t.${c}`)
          .join(", ")}
           FROM visual_templates t
           JOIN organization_visual_templates ovt ON ovt.template_id = t.id
          WHERE ovt.organization_id = $1 AND t.id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toTemplate(row) : null;
    },

    async listAllIds(): Promise<string[]> {
      const { rows } = await pool.query<{ id: string }>("SELECT id FROM visual_templates");
      return rows.map((row) => row.id);
    },

    async assignAllToOrganization(organizationId): Promise<void> {
      await pool.query(
        `INSERT INTO organization_visual_templates (organization_id, template_id)
         SELECT $1, id FROM visual_templates
         ON CONFLICT DO NOTHING`,
        [organizationId],
      );
    },

    async assignToAllOrganizations(templateId): Promise<void> {
      await pool.query(
        `INSERT INTO organization_visual_templates (organization_id, template_id)
         SELECT id, $1 FROM organizations
         ON CONFLICT DO NOTHING`,
        [templateId],
      );
    },

    async unassign(organizationId, templateId): Promise<void> {
      await pool.query(
        `DELETE FROM organization_visual_templates
          WHERE organization_id = $1 AND template_id = $2`,
        [organizationId, templateId],
      );
    },

    async findById(id): Promise<VisualTemplate | null> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS} FROM visual_templates WHERE id = $1`,
        [id],
      );
      const row = rows[0];
      return row ? toTemplate(row) : null;
    },

    async findByKey(key): Promise<VisualTemplate | null> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS} FROM visual_templates WHERE lower(key) = lower($1)`,
        [key],
      );
      const row = rows[0];
      return row ? toTemplate(row) : null;
    },

    async listVersions(templateId): Promise<VisualTemplateVersion[]> {
      const { rows } = await pool.query<VersionRow>(
        `SELECT ${VERSION_COLUMNS} FROM visual_template_versions WHERE template_id = $1 ORDER BY created_at DESC`,
        [templateId],
      );
      return rows.map(toVersion);
    },

    async findVersion(templateId, version): Promise<VisualTemplateVersion | null> {
      const { rows } = await pool.query<VersionRow>(
        `SELECT ${VERSION_COLUMNS} FROM visual_template_versions WHERE template_id = $1 AND version = $2`,
        [templateId, version],
      );
      const row = rows[0];
      return row ? toVersion(row) : null;
    },

    async findAsset(versionId, path): Promise<VisualTemplateAsset | null> {
      const { rows } = await pool.query<AssetRow>(
        `SELECT ${ASSET_COLUMNS} FROM visual_template_assets WHERE version_id = $1 AND path = $2`,
        [versionId, path],
      );
      const row = rows[0];
      return row ? toAsset(row) : null;
    },

    async createTemplate(input: CreateVisualTemplateInput): Promise<VisualTemplate> {
      const { rows } = await pool.query<TemplateRow>(
        `INSERT INTO visual_templates (key, name, description, author, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${TEMPLATE_COLUMNS}`,
        [input.key, input.name, input.description, input.author, input.createdBy],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création du template visuel");
      return toTemplate(row);
    },

    async createVersion(input: CreateVisualTemplateVersionInput): Promise<VisualTemplateVersion> {
      const { rows } = await pool.query<VersionRow>(
        `INSERT INTO visual_template_versions
           (template_id, version, host_protocol, trust_level, mode, manifest, entry, integrity, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${VERSION_COLUMNS}`,
        [
          input.templateId,
          input.version,
          input.hostProtocol,
          input.trustLevel,
          input.mode,
          JSON.stringify(input.manifest),
          input.entry,
          input.integrity,
          input.createdBy,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de la version du template visuel");
      return toVersion(row);
    },

    async addAsset(input: CreateVisualTemplateAssetInput): Promise<VisualTemplateAsset> {
      const { rows } = await pool.query<AssetRow>(
        `INSERT INTO visual_template_assets (version_id, path, storage_key, sha256, size, mime)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${ASSET_COLUMNS}`,
        [input.versionId, input.path, input.storageKey, input.sha256, input.size, input.mime],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec d'enregistrement de l'asset du template visuel");
      return toAsset(row);
    },

    async deleteTemplate(id): Promise<boolean> {
      const result = await pool.query("DELETE FROM visual_templates WHERE id = $1", [id]);
      return (result.rowCount ?? 0) > 0;
    },
  };
}
