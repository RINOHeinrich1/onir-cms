import type { Pool } from "pg";
import type { AiClusterInput, AiUsageRepository } from "@/application/ports/ai-usage-repository";
import type {
  AiCluster,
  AiClusterMember,
  AiLinkTarget,
  AiLinkUsage,
  AiTarget,
  AiUsage,
} from "@/domain/entities/ai-usage";

type TargetRow = {
  target_kind: "model" | "cluster";
  provider_id: string | null;
  model: string | null;
  cluster_id: string | null;
};

type LinkTargetRow = Omit<TargetRow, "target_kind"> & {
  usage: AiLinkUsage;
  target_kind: "inherit" | "model" | "cluster";
};

type ClusterRow = {
  id: string;
  organization_id: string;
  label: string;
  description: string;
  actif: boolean;
  created_at: Date;
  updated_at: Date;
};

type MemberRow = {
  cluster_id: string;
  position: number;
  provider_id: string;
  model: string;
  enabled: boolean;
};

function targetFrom(row: TargetRow): AiTarget {
  if (row.target_kind === "cluster" && row.cluster_id !== null) {
    return { kind: "cluster", clusterId: row.cluster_id };
  }
  return {
    kind: "model",
    providerId: row.provider_id ?? "",
    model: row.model ?? "",
  };
}

function linkTargetFrom(row: LinkTargetRow): AiLinkTarget {
  if (row.target_kind === "inherit") return { kind: "inherit" };
  return targetFrom(row as TargetRow);
}

function clusterFrom(row: ClusterRow, members: AiClusterMember[]): AiCluster {
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    description: row.description,
    actif: row.actif,
    members,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function loadMembers(pool: Pool, organizationId: string, clusterId: string) {
  const { rows } = await pool.query<MemberRow>(
    `SELECT cluster_id, position, provider_id, model, enabled
       FROM ai_cluster_members
      WHERE organization_id = $1 AND cluster_id = $2
      ORDER BY position`,
    [organizationId, clusterId],
  );
  return rows.map((row) => ({
    position: row.position,
    providerId: row.provider_id,
    model: row.model,
    enabled: row.enabled,
  }));
}

async function insertMembers(
  client: { query: Pool["query"] },
  organizationId: string,
  clusterId: string,
  members: AiClusterInput["members"],
): Promise<void> {
  for (const [index, member] of members.entries()) {
    await client.query(
      `INSERT INTO ai_cluster_members
         (cluster_id, organization_id, position, provider_id, model, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [clusterId, organizationId, index + 1, member.providerId, member.model, member.enabled],
    );
  }
}

export function pgAiUsageRepository(pool: Pool): AiUsageRepository {
  return {
    async listDefaults(organizationId) {
      const { rows } = await pool.query<{ usage: AiUsage } & TargetRow>(
        `SELECT usage, target_kind, provider_id, model, cluster_id
           FROM organization_ai_usage_defaults
          WHERE organization_id = $1`,
        [organizationId],
      );
      return rows.map((row) => ({
        usage: row.usage,
        target: targetFrom(row),
      }));
    },

    async setDefault(organizationId, usage, target, updatedBy) {
      const isCluster = target.kind === "cluster";
      await pool.query(
        `INSERT INTO organization_ai_usage_defaults
           (organization_id, usage, target_kind, provider_id, model, cluster_id, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (organization_id, usage) DO UPDATE
           SET target_kind = EXCLUDED.target_kind,
               provider_id = EXCLUDED.provider_id,
               model = EXCLUDED.model,
               cluster_id = EXCLUDED.cluster_id,
               updated_by = EXCLUDED.updated_by,
               updated_at = now()`,
        [
          organizationId,
          usage,
          target.kind,
          isCluster ? null : target.providerId,
          isCluster ? null : target.model,
          isCluster ? target.clusterId : null,
          updatedBy,
        ],
      );
    },

    async clearDefault(organizationId, usage) {
      await pool.query(
        `DELETE FROM organization_ai_usage_defaults
          WHERE organization_id = $1 AND usage = $2`,
        [organizationId, usage],
      );
    },

    async listLinkOverrides(organizationId, chatLinkId) {
      const { rows } = await pool.query<LinkTargetRow>(
        `SELECT usage, target_kind, provider_id, model, cluster_id
           FROM chat_link_ai_usage_overrides
          WHERE organization_id = $1 AND chat_link_id = $2`,
        [organizationId, chatLinkId],
      );
      return rows.map((row) => ({ usage: row.usage, target: linkTargetFrom(row) }));
    },

    async setLinkOverride(organizationId, chatLinkId, usage, target: AiLinkTarget) {
      const isInherit = target.kind === "inherit";
      const isCluster = target.kind === "cluster";
      await pool.query(
        `INSERT INTO chat_link_ai_usage_overrides
           (chat_link_id, organization_id, usage, target_kind, provider_id, model, cluster_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (chat_link_id, usage) DO UPDATE
           SET target_kind = EXCLUDED.target_kind,
               provider_id = EXCLUDED.provider_id,
               model = EXCLUDED.model,
               cluster_id = EXCLUDED.cluster_id,
               updated_at = now()`,
        [
          chatLinkId,
          organizationId,
          usage,
          target.kind,
          isInherit || isCluster ? null : target.providerId,
          isInherit || isCluster ? null : target.model,
          isCluster ? target.clusterId : null,
        ],
      );
    },

    async clearLinkOverride(organizationId, chatLinkId, usage) {
      await pool.query(
        `DELETE FROM chat_link_ai_usage_overrides
          WHERE organization_id = $1 AND chat_link_id = $2 AND usage = $3`,
        [organizationId, chatLinkId, usage],
      );
    },

    async listClusters(organizationId, includeInactive = false) {
      const { rows } = await pool.query<ClusterRow>(
        `SELECT id, organization_id, label, description, actif, created_at, updated_at
           FROM ai_clusters
          WHERE organization_id = $1 ${includeInactive ? "" : "AND actif = true"}
          ORDER BY lower(label)`,
        [organizationId],
      );
      return Promise.all(
        rows.map(async (row) => clusterFrom(row, await loadMembers(pool, organizationId, row.id))),
      );
    },

    async findCluster(organizationId, id) {
      const { rows } = await pool.query<ClusterRow>(
        `SELECT id, organization_id, label, description, actif, created_at, updated_at
           FROM ai_clusters
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      if (row === undefined) return null;
      return clusterFrom(row, await loadMembers(pool, organizationId, id));
    },

    async createCluster(organizationId, input, createdBy) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query<ClusterRow>(
          `INSERT INTO ai_clusters (organization_id, label, description, actif, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, organization_id, label, description, actif, created_at, updated_at`,
          [organizationId, input.label, input.description, input.actif, createdBy],
        );
        const row = inserted.rows[0];
        if (row === undefined) throw new Error("Cluster non créé");
        await insertMembers(client, organizationId, row.id, input.members);
        const members = await loadMembers(client as unknown as Pool, organizationId, row.id);
        await client.query("COMMIT");
        return clusterFrom(row, members);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async updateCluster(organizationId, id, input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const updated = await client.query<ClusterRow>(
          `UPDATE ai_clusters
              SET label = $3, description = $4, actif = $5, updated_at = now()
            WHERE organization_id = $1 AND id = $2
            RETURNING id, organization_id, label, description, actif, created_at, updated_at`,
          [organizationId, id, input.label, input.description, input.actif],
        );
        const row = updated.rows[0];
        if (row === undefined) {
          await client.query("ROLLBACK");
          return null;
        }
        await client.query(
          `DELETE FROM ai_cluster_members WHERE organization_id = $1 AND cluster_id = $2`,
          [organizationId, id],
        );
        await insertMembers(client, organizationId, id, input.members);
        const members = await loadMembers(client as unknown as Pool, organizationId, id);
        await client.query("COMMIT");
        return clusterFrom(row, members);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteCluster(organizationId, id) {
      const result = await pool.query(
        `DELETE FROM ai_clusters WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
