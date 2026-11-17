import type { Pool } from "pg";
import type {
  CreateVisualTemplateAssetInput,
  CreateVisualTemplateInput,
  CreateVisualTemplateVersionInput,
  InstallationSource,
  VisualTemplate,
  VisualTemplateAsset,
  VisualTemplateInstallation,
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
  owner_organization_id: string | null;
  uploaded_by: string | null;
  disabled_at: Date | null;
  disabled_by: string | null;
  disabled_reason: string | null;
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

type InstallationRow = {
  organization_id: string;
  template_id: string;
  installed_by: string | null;
  installed_at: Date;
  source: string;
};

const TEMPLATE_COLUMNS =
  "id, key, name, description, author, owner_organization_id, uploaded_by, disabled_at, disabled_by, disabled_reason, created_by, created_at, updated_at";
const VERSION_COLUMNS =
  "id, template_id, version, host_protocol, trust_level, mode, manifest, entry, integrity, created_at";
const ASSET_COLUMNS = "id, version_id, path, storage_key, sha256, size, mime";
const INSTALLATION_COLUMNS = "organization_id, template_id, installed_by, installed_at, source";

function toTemplate(row: TemplateRow): VisualTemplate {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    author: row.author,
    ownerOrganizationId: row.owner_organization_id,
    uploadedBy: row.uploaded_by,
    disabledAt: row.disabled_at ? row.disabled_at.toISOString() : null,
    disabledBy: row.disabled_by,
    disabledReason: row.disabled_reason,
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

function toInstallation(row: InstallationRow): VisualTemplateInstallation {
  return {
    organizationId: row.organization_id,
    templateId: row.template_id,
    installedBy: row.installed_by,
    installedAt: row.installed_at.toISOString(),
    source: row.source as InstallationSource,
  };
}

/** Adapter PostgreSQL du port `VisualTemplateRepository`. */
export function pgVisualTemplateRepository(pool: Pool): VisualTemplateRepository {
  async function findInstallation(
    organizationId: string,
    templateId: string,
  ): Promise<VisualTemplateInstallation | null> {
    const { rows } = await pool.query<InstallationRow>(
      `SELECT ${INSTALLATION_COLUMNS}
         FROM organization_visual_templates
        WHERE organization_id = $1 AND template_id = $2`,
      [organizationId, templateId],
    );
    const row = rows[0];
    return row ? toInstallation(row) : null;
  }

  return {
    async list(): Promise<VisualTemplate[]> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS} FROM visual_templates
          ORDER BY owner_organization_id NULLS FIRST, lower(key)`,
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
            AND t.disabled_at IS NULL
          ORDER BY t.owner_organization_id NULLS FIRST, lower(t.key)`,
        [organizationId],
      );
      return rows.map(toTemplate);
    },

    async listAvailableForOrganization(organizationId): Promise<VisualTemplate[]> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS.split(", ")
          .map((c) => `t.${c}`)
          .join(", ")}
           FROM visual_templates t
          WHERE t.owner_organization_id IS NULL
            AND t.disabled_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM organization_visual_templates ovt
               WHERE ovt.organization_id = $1 AND ovt.template_id = t.id
            )
          ORDER BY lower(t.key)`,
        [organizationId],
      );
      return rows.map(toTemplate);
    },

    async listOwnedByOrganization(organizationId): Promise<VisualTemplate[]> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS}
           FROM visual_templates
          WHERE owner_organization_id = $1
          ORDER BY disabled_at NULLS FIRST, lower(key)`,
        [organizationId],
      );
      return rows.map(toTemplate);
    },

    async findByIdForOrganization(organizationId, id, includeDisabled = false) {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS}
           FROM visual_templates
          WHERE id = $2
            AND (owner_organization_id IS NULL OR owner_organization_id = $1)
            AND ($3::boolean OR disabled_at IS NULL)`,
        [organizationId, id, includeDisabled],
      );
      const row = rows[0];
      return row ? toTemplate(row) : null;
    },

    async findAssignedById(organizationId, id): Promise<VisualTemplate | null> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS.split(", ")
          .map((c) => `t.${c}`)
          .join(", ")}
           FROM visual_templates t
           JOIN organization_visual_templates ovt ON ovt.template_id = t.id
          WHERE ovt.organization_id = $1 AND t.id = $2
            AND (t.owner_organization_id IS NULL OR t.owner_organization_id = $1)
            AND t.disabled_at IS NULL`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toTemplate(row) : null;
    },

    async findPlatformByKey(key): Promise<VisualTemplate | null> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS}
           FROM visual_templates
          WHERE owner_organization_id IS NULL
            AND lower(key) = lower($1)`,
        [key],
      );
      const row = rows[0];
      return row ? toTemplate(row) : null;
    },

    async findByKeyForOrganization(organizationId, key): Promise<VisualTemplate | null> {
      const { rows } = await pool.query<TemplateRow>(
        `SELECT ${TEMPLATE_COLUMNS}
           FROM visual_templates
          WHERE lower(key) = lower($2)
            AND (owner_organization_id IS NULL OR owner_organization_id = $1)
            AND disabled_at IS NULL
          ORDER BY owner_organization_id NULLS FIRST
          LIMIT 1`,
        [organizationId, key],
      );
      const row = rows[0];
      return row ? toTemplate(row) : null;
    },

    async findInstallation(organizationId, templateId) {
      return findInstallation(organizationId, templateId);
    },

    async countOwnedByOrganization(organizationId): Promise<number> {
      const { rows } = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM visual_templates
          WHERE owner_organization_id = $1`,
        [organizationId],
      );
      return rows[0]?.count ?? 0;
    },

    async countLinkUsages(organizationId, templateId): Promise<number> {
      const { rows } = await pool.query<{ count: number }>(
        `SELECT count(DISTINCT link_id)::int AS count
           FROM (
             SELECT id AS link_id
               FROM chat_links
              WHERE organization_id = $1 AND visual_template_id = $2
             UNION
             SELECT c.link_id
               FROM chat_link_channels c
               JOIN chat_links l ON l.id = c.link_id
              WHERE l.organization_id = $1 AND c.visual_template_id = $2
           ) usages`,
        [organizationId, templateId],
      );
      return rows[0]?.count ?? 0;
    },

    async listAllPlatformIds(): Promise<string[]> {
      const { rows } = await pool.query<{ id: string }>(
        "SELECT id FROM visual_templates WHERE owner_organization_id IS NULL AND disabled_at IS NULL",
      );
      return rows.map((row) => row.id);
    },

    async assignAllToOrganization(organizationId, source = "platform_default"): Promise<void> {
      await pool.query(
        `INSERT INTO organization_visual_templates
           (organization_id, template_id, installed_by, installed_at, source)
         SELECT $1, id, NULL, now(), $2
           FROM visual_templates
          WHERE owner_organization_id IS NULL AND disabled_at IS NULL
         ON CONFLICT DO NOTHING`,
        [organizationId, source],
      );
    },

    async assignToAllOrganizations(templateId, source = "platform_default"): Promise<void> {
      await pool.query(
        `INSERT INTO organization_visual_templates
           (organization_id, template_id, installed_by, installed_at, source)
         SELECT id, $1, NULL, now(), $2
           FROM organizations
         ON CONFLICT DO NOTHING`,
        [templateId, source],
      );
    },

    async install(organizationId, templateId, actorId, source) {
      const { rows } = await pool.query<InstallationRow>(
        `INSERT INTO organization_visual_templates
           (organization_id, template_id, installed_by, installed_at, source)
         VALUES ($1, $2, $3, now(), $4)
         ON CONFLICT (organization_id, template_id) DO NOTHING
         RETURNING ${INSTALLATION_COLUMNS}`,
        [organizationId, templateId, actorId, source],
      );
      const inserted = rows[0];
      if (inserted) return toInstallation(inserted);
      const existing = await findInstallation(organizationId, templateId);
      if (existing === null) throw new Error("Installation du template impossible");
      return existing;
    },

    async uninstall(organizationId, templateId): Promise<boolean> {
      const result = await pool.query(
        `DELETE FROM organization_visual_templates ovt
          WHERE ovt.organization_id = $1
            AND ovt.template_id = $2
            AND NOT EXISTS (
              SELECT 1 FROM chat_links l
               WHERE l.organization_id = $1 AND l.visual_template_id = $2
              UNION ALL
              SELECT 1 FROM chat_link_channels c
                JOIN chat_links l ON l.id = c.link_id
               WHERE l.organization_id = $1 AND c.visual_template_id = $2
            )`,
        [organizationId, templateId],
      );
      return (result.rowCount ?? 0) > 0;
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
        `SELECT ${TEMPLATE_COLUMNS} FROM visual_templates
          WHERE lower(key) = lower($1)
          ORDER BY owner_organization_id NULLS FIRST
          LIMIT 1`,
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

    async findVersionForOrganization(organizationId, templateId, version) {
      const { rows } = await pool.query<VersionRow>(
        `SELECT ${VERSION_COLUMNS.split(", ")
          .map((c) => `v.${c}`)
          .join(", ")}
           FROM visual_template_versions v
           JOIN visual_templates t ON t.id = v.template_id
          WHERE v.template_id = $2
            AND v.version = $3
            AND (t.owner_organization_id IS NULL OR t.owner_organization_id = $1)
            AND t.disabled_at IS NULL`,
        [organizationId, templateId, version],
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
        `INSERT INTO visual_templates
           (key, name, description, author, owner_organization_id, uploaded_by, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${TEMPLATE_COLUMNS}`,
        [
          input.key,
          input.name,
          input.description,
          input.author,
          input.ownerOrganizationId ?? null,
          input.uploadedBy ?? null,
          input.createdBy,
        ],
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

    async setDisabled(id, disabled, actorId, reason) {
      const { rows } = await pool.query<TemplateRow>(
        `UPDATE visual_templates
            SET disabled_at = CASE WHEN $2 THEN now() ELSE NULL END,
                disabled_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
                disabled_reason = CASE WHEN $2 THEN $4 ELSE NULL END,
                updated_at = now()
          WHERE id = $1
          RETURNING ${TEMPLATE_COLUMNS}`,
        [id, disabled, actorId, reason],
      );
      const row = rows[0];
      return row ? toTemplate(row) : null;
    },

    async deleteTemplate(id): Promise<boolean> {
      const result = await pool.query("DELETE FROM visual_templates WHERE id = $1", [id]);
      return (result.rowCount ?? 0) > 0;
    },
  };
}
