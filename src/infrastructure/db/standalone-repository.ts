import type { Pool, PoolClient } from "pg";
import type {
  ActiveStandaloneMapping,
  CreateStandaloneBuildInput,
  CreateStandaloneDomainInput,
  StandaloneBuild,
  StandaloneDomain,
  StandaloneRepository,
  StandaloneSettings,
} from "@/application/ports/standalone-repository";
import {
  isStandaloneBuildStatus,
  isStandaloneDomainKind,
  isStandaloneSslStatus,
  isStandaloneVerificationStatus,
  normalizeStandaloneHostname,
} from "@/domain/standalone";

type BuildRow = {
  id: string;
  organization_id: string;
  chat_link_id: string;
  build_number: number;
  template_id: string | null;
  template_version: string | null;
  config_hash: string;
  artifact_key: string | null;
  artifact_sha256: string | null;
  status: string;
  error: string | null;
  created_by: string | null;
  created_at: Date;
  activated_at: Date | null;
  superseded_at: Date | null;
};

type DomainRow = {
  id: string;
  organization_id: string;
  chat_link_id: string;
  hostname: string;
  kind: string;
  is_primary: boolean;
  verification_token: string | null;
  verification_status: string;
  ssl_status: string;
  last_checked_at: Date | null;
  activated_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

type SettingsRow = {
  chat_link_id: string;
  organization_id: string;
  enabled: boolean;
  active_build_id: string | null;
  created_at: Date;
  updated_at: Date;
};

const BUILD_COLUMNS = `
  id, organization_id, chat_link_id, build_number, template_id, template_version,
  config_hash, artifact_key, artifact_sha256, status, error, created_by,
  created_at, activated_at, superseded_at
`;

const DOMAIN_COLUMNS = `
  id, organization_id, chat_link_id, hostname, kind, is_primary,
  verification_token, verification_status, ssl_status, last_checked_at,
  activated_at, last_error, created_at, updated_at
`;

function toBuild(row: BuildRow): StandaloneBuild {
  if (!isStandaloneBuildStatus(row.status)) {
    throw new Error(`Statut de build standalone inconnu : ${row.status}`);
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    chatLinkId: row.chat_link_id,
    buildNumber: row.build_number,
    templateId: row.template_id,
    templateVersion: row.template_version,
    configHash: row.config_hash,
    artifactKey: row.artifact_key,
    artifactSha256: row.artifact_sha256,
    status: row.status,
    error: row.error,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    activatedAt: row.activated_at?.toISOString() ?? null,
    supersededAt: row.superseded_at?.toISOString() ?? null,
  };
}

function toDomain(row: DomainRow): StandaloneDomain {
  if (!isStandaloneDomainKind(row.kind)) {
    throw new Error(`Type de domaine standalone inconnu : ${row.kind}`);
  }
  if (!isStandaloneVerificationStatus(row.verification_status)) {
    throw new Error(`Statut de vérification inconnu : ${row.verification_status}`);
  }
  if (!isStandaloneSslStatus(row.ssl_status)) {
    throw new Error(`Statut SSL inconnu : ${row.ssl_status}`);
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    chatLinkId: row.chat_link_id,
    hostname: row.hostname,
    kind: row.kind,
    isPrimary: row.is_primary,
    verificationToken: row.verification_token,
    verificationStatus: row.verification_status,
    sslStatus: row.ssl_status,
    lastCheckedAt: row.last_checked_at?.toISOString() ?? null,
    activatedAt: row.activated_at?.toISOString() ?? null,
    lastError: row.last_error,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toSettings(row: SettingsRow): StandaloneSettings {
  return {
    chatLinkId: row.chat_link_id,
    organizationId: row.organization_id,
    enabled: row.enabled,
    activeBuildId: row.active_build_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function pgStandaloneRepository(pool: Pool): StandaloneRepository {
  return {
    async findSettings(chatLinkId) {
      const { rows } = await pool.query<SettingsRow>(
        `SELECT chat_link_id, organization_id, enabled, active_build_id, created_at, updated_at
           FROM chatbot_standalone_settings WHERE chat_link_id = $1`,
        [chatLinkId],
      );
      return rows[0] === undefined ? null : toSettings(rows[0]);
    },

    async ensureSettings(input) {
      const { rows } = await pool.query<SettingsRow>(
        `INSERT INTO chatbot_standalone_settings (chat_link_id, organization_id)
         VALUES ($1, $2)
         ON CONFLICT (chat_link_id) DO UPDATE SET updated_at = chatbot_standalone_settings.updated_at
         RETURNING chat_link_id, organization_id, enabled, active_build_id, created_at, updated_at`,
        [input.chatLinkId, input.organizationId],
      );
      const row = rows[0];
      if (row === undefined) throw new Error("Échec de création des réglages standalone");
      return toSettings(row);
    },

    async createBuild(input: CreateStandaloneBuildInput) {
      return inTransaction(pool, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [input.chatLinkId]);
        const { rows: numberRows } = await client.query<{ next: number }>(
          `SELECT COALESCE(MAX(build_number), 0) + 1 AS next
             FROM chatbot_standalone_builds WHERE chat_link_id = $1`,
          [input.chatLinkId],
        );
        const next = numberRows[0]?.next ?? 1;
        const { rows } = await client.query<BuildRow>(
          `INSERT INTO chatbot_standalone_builds
            (organization_id, chat_link_id, build_number, template_id, template_version, config_hash, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING ${BUILD_COLUMNS}`,
          [
            input.organizationId,
            input.chatLinkId,
            next,
            input.templateId,
            input.templateVersion,
            input.configHash,
            input.createdBy,
          ],
        );
        const row = rows[0];
        if (row === undefined) throw new Error("Échec de création du build standalone");
        return toBuild(row);
      });
    },

    async findBuild(id) {
      const { rows } = await pool.query<BuildRow>(
        `SELECT ${BUILD_COLUMNS} FROM chatbot_standalone_builds WHERE id = $1`,
        [id],
      );
      return rows[0] === undefined ? null : toBuild(rows[0]);
    },

    async listBuilds(chatLinkId) {
      const { rows } = await pool.query<BuildRow>(
        `SELECT ${BUILD_COLUMNS} FROM chatbot_standalone_builds
          WHERE chat_link_id = $1 ORDER BY build_number DESC`,
        [chatLinkId],
      );
      return rows.map(toBuild);
    },

    async markBuildReady(input) {
      const { rows } = await pool.query<BuildRow>(
        `UPDATE chatbot_standalone_builds
            SET status = 'ready', artifact_key = $2, artifact_sha256 = $3, error = NULL
          WHERE id = $1 AND status IN ('queued', 'building')
          RETURNING ${BUILD_COLUMNS}`,
        [input.id, input.artifactKey, input.artifactSha256],
      );
      const row = rows[0];
      if (row === undefined) throw new Error("Build non activable ou déjà terminé");
      return toBuild(row);
    },

    async markBuildFailed(input) {
      const { rows } = await pool.query<BuildRow>(
        `UPDATE chatbot_standalone_builds
            SET status = 'failed', error = $2
          WHERE id = $1 AND status IN ('queued', 'building', 'ready')
          RETURNING ${BUILD_COLUMNS}`,
        [input.id, input.error],
      );
      const row = rows[0];
      if (row === undefined) throw new Error("Build introuvable ou déjà terminé");
      return toBuild(row);
    },

    async activateBuild(input) {
      return inTransaction(pool, async (client) => {
        const { rows: currentRows } = await client.query<BuildRow>(
          `SELECT ${BUILD_COLUMNS} FROM chatbot_standalone_builds
            WHERE id = $1 AND chat_link_id = $2 FOR UPDATE`,
          [input.buildId, input.chatLinkId],
        );
        const current = currentRows[0];
        if (current === undefined) throw new Error("Build introuvable");
        if (current.status !== "ready") throw new Error("Seul un build prêt peut être activé");

        await client.query(
          `UPDATE chatbot_standalone_builds
              SET status = 'superseded', superseded_at = now()
            WHERE chat_link_id = $1 AND status = 'active' AND id <> $2`,
          [input.chatLinkId, input.buildId],
        );
        await client.query(
          `UPDATE chatbot_standalone_builds
              SET status = 'active', activated_at = now(), superseded_at = NULL
            WHERE id = $1`,
          [input.buildId],
        );
        await client.query(
          `INSERT INTO chatbot_standalone_settings (chat_link_id, organization_id, active_build_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (chat_link_id) DO UPDATE
             SET active_build_id = EXCLUDED.active_build_id, updated_at = now()`,
          [input.chatLinkId, input.organizationId, input.buildId],
        );
        const { rows } = await client.query<BuildRow>(
          `SELECT ${BUILD_COLUMNS} FROM chatbot_standalone_builds WHERE id = $1`,
          [input.buildId],
        );
        const row = rows[0];
        if (row === undefined) throw new Error("Build introuvable après activation");
        return toBuild(row);
      });
    },

    async listDomains(chatLinkId) {
      const { rows } = await pool.query<DomainRow>(
        `SELECT ${DOMAIN_COLUMNS} FROM chatbot_domains
          WHERE chat_link_id = $1 ORDER BY is_primary DESC, created_at`,
        [chatLinkId],
      );
      return rows.map(toDomain);
    },

    async findDomain(id) {
      const { rows } = await pool.query<DomainRow>(
        `SELECT ${DOMAIN_COLUMNS} FROM chatbot_domains WHERE id = $1`,
        [id],
      );
      return rows[0] === undefined ? null : toDomain(rows[0]);
    },

    async findDomainByHostname(hostname) {
      const normalized = normalizeStandaloneHostname(hostname);
      const { rows } = await pool.query<DomainRow>(
        `SELECT ${DOMAIN_COLUMNS} FROM chatbot_domains WHERE hostname = $1`,
        [normalized],
      );
      return rows[0] === undefined ? null : toDomain(rows[0]);
    },

    async createDomain(input: CreateStandaloneDomainInput) {
      const hostname = normalizeStandaloneHostname(input.hostname);
      const { rows } = await pool.query<DomainRow>(
        `INSERT INTO chatbot_domains
          (organization_id, chat_link_id, hostname, kind, verification_token)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${DOMAIN_COLUMNS}`,
        [input.organizationId, input.chatLinkId, hostname, input.kind, input.verificationToken],
      );
      const row = rows[0];
      if (row === undefined) throw new Error("Échec de création du domaine");
      return toDomain(row);
    },

    async setDomainVerification(input) {
      const { rows } = await pool.query<DomainRow>(
        `UPDATE chatbot_domains
            SET verification_status = $2, last_checked_at = now(),
                last_error = $3, updated_at = now(),
                activated_at = CASE WHEN $2 = 'verified' THEN COALESCE(activated_at, now()) ELSE activated_at END
          WHERE id = $1
          RETURNING ${DOMAIN_COLUMNS}`,
        [input.id, input.status, input.lastError ?? null],
      );
      const row = rows[0];
      if (row === undefined) throw new Error("Domaine introuvable");
      return toDomain(row);
    },

    async setDomainSsl(input) {
      const { rows } = await pool.query<DomainRow>(
        `UPDATE chatbot_domains
            SET ssl_status = $2, last_error = $3, updated_at = now()
          WHERE id = $1
          RETURNING ${DOMAIN_COLUMNS}`,
        [input.id, input.status, input.lastError ?? null],
      );
      const row = rows[0];
      if (row === undefined) throw new Error("Domaine introuvable");
      return toDomain(row);
    },

    async setPrimaryDomain(input) {
      return inTransaction(pool, async (client) => {
        await client.query(
          `UPDATE chatbot_domains SET is_primary = false, updated_at = now()
            WHERE chat_link_id = $1 AND is_primary = true`,
          [input.chatLinkId],
        );
        const { rows } = await client.query<DomainRow>(
          `UPDATE chatbot_domains
              SET is_primary = true, updated_at = now()
            WHERE id = $1 AND chat_link_id = $2
            RETURNING ${DOMAIN_COLUMNS}`,
          [input.domainId, input.chatLinkId],
        );
        const row = rows[0];
        if (row === undefined) throw new Error("Domaine introuvable");
        return toDomain(row);
      });
    },

    async deleteDomain(id) {
      await pool.query("DELETE FROM chatbot_domains WHERE id = $1", [id]);
    },

    async findActiveMappingByHostname(hostname) {
      const normalized = normalizeStandaloneHostname(hostname);
      const { rows } = await pool.query<{
        hostname: string;
        chat_link_id: string;
        organization_id: string;
        build_id: string;
        artifact_key: string;
        artifact_sha256: string;
      }>(
        `SELECT d.hostname, d.chat_link_id, d.organization_id,
                b.id AS build_id, b.artifact_key, b.artifact_sha256
           FROM chatbot_domains d
           JOIN chatbot_standalone_settings s ON s.chat_link_id = d.chat_link_id
           JOIN chatbot_standalone_builds b ON b.id = s.active_build_id
          WHERE d.hostname = $1
            AND s.enabled = true
            AND d.verification_status = 'verified'
            AND d.ssl_status = 'active'
            AND b.status = 'active'
            AND b.artifact_key IS NOT NULL
            AND b.artifact_sha256 IS NOT NULL
          LIMIT 1`,
        [normalized],
      );
      const row = rows[0];
      if (row === undefined) return null;
      return {
        hostname: row.hostname,
        chatLinkId: row.chat_link_id,
        organizationId: row.organization_id,
        buildId: row.build_id,
        artifactKey: row.artifact_key,
        artifactSha256: row.artifact_sha256,
      } satisfies ActiveStandaloneMapping;
    },
  };
}
