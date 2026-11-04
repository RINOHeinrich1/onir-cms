import type { Pool } from "pg";
import type {
  AiGrantCatalog,
  AiGrantCatalogCluster,
  AiGrantCatalogProvider,
  AiGrantRepository,
  AiGrantSet,
  AiGrantTarget,
} from "@/application/ports/ai-grant-repository";

type ProviderRow = {
  id: string;
  label: string;
  organization_id: string;
  organization_name: string;
  archived_at: Date | null;
};

type ModelRow = {
  provider_id: string;
  model_id: string;
  label: string;
  enabled: boolean;
};

type ClusterRow = {
  id: string;
  label: string;
  organization_id: string;
  organization_name: string;
  actif: boolean;
};

type MemberRow = {
  cluster_id: string;
  provider_id: string;
  model: string;
  enabled: boolean;
};

function grantValues(target: AiGrantTarget): [string, string, string, string] {
  if (target.kind === "provider") {
    return ["provider", target.providerId, "", ""];
  }
  if (target.kind === "model") {
    return ["model", target.providerId, target.model, ""];
  }
  return ["cluster", "", "", target.clusterId];
}

/** Adapter PostgreSQL des grants du catalogue IA partagé (ADR-0065). */
export function pgAiGrantRepository(pool: Pool): AiGrantRepository {
  return {
    async listCatalog(): Promise<AiGrantCatalog> {
      const [providerRows, modelRows, clusterRows, memberRows] = await Promise.all([
        pool.query<ProviderRow>(
          `SELECT p.id, p.label, p.organization_id, o.name AS organization_name,
                  p.archived_at
             FROM ai_providers p
             JOIN organizations o ON o.id = p.organization_id
            ORDER BY lower(o.name), lower(p.label)`,
        ),
        pool.query<ModelRow>(
          `SELECT provider_id, model_id, label, enabled
             FROM ai_provider_models
            ORDER BY lower(label), model_id`,
        ),
        pool.query<ClusterRow>(
          `SELECT c.id, c.label, c.organization_id, o.name AS organization_name, c.actif
             FROM ai_clusters c
             JOIN organizations o ON o.id = c.organization_id
            ORDER BY lower(o.name), lower(c.label)`,
        ),
        pool.query<MemberRow>(
          `SELECT cluster_id, provider_id, model, enabled
             FROM ai_cluster_members
            ORDER BY cluster_id, position`,
        ),
      ]);
      const modelsByProvider = new Map<string, ModelRow[]>();
      for (const model of modelRows.rows) {
        const list = modelsByProvider.get(model.provider_id) ?? [];
        list.push(model);
        modelsByProvider.set(model.provider_id, list);
      }
      const membersByCluster = new Map<string, MemberRow[]>();
      for (const member of memberRows.rows) {
        const list = membersByCluster.get(member.cluster_id) ?? [];
        list.push(member);
        membersByCluster.set(member.cluster_id, list);
      }
      const providers: AiGrantCatalogProvider[] = providerRows.rows.map((row) => ({
        id: row.id,
        label: row.label,
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        archivedAt: row.archived_at === null ? null : row.archived_at.toISOString(),
        models: (modelsByProvider.get(row.id) ?? []).map((model) => ({
          modelId: model.model_id,
          label: model.label,
          enabled: model.enabled,
        })),
      }));
      const clusters: AiGrantCatalogCluster[] = clusterRows.rows.map((row) => ({
        id: row.id,
        label: row.label,
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        actif: row.actif,
        members: (membersByCluster.get(row.id) ?? []).map((member) => ({
          providerId: member.provider_id,
          model: member.model,
          enabled: member.enabled,
        })),
      }));
      return { providers, clusters };
    },

    async listGrants(organizationId: string): Promise<AiGrantSet> {
      const [providers, models, clusters] = await Promise.all([
        pool.query<{ provider_id: string }>(
          "SELECT provider_id FROM ai_provider_grants WHERE organization_id = $1",
          [organizationId],
        ),
        pool.query<{ provider_id: string; model_id: string }>(
          "SELECT provider_id, model_id FROM ai_model_grants WHERE organization_id = $1",
          [organizationId],
        ),
        pool.query<{ cluster_id: string }>(
          "SELECT cluster_id FROM ai_cluster_grants WHERE organization_id = $1",
          [organizationId],
        ),
      ]);
      return {
        providers: providers.rows.map((row) => row.provider_id),
        models: models.rows.map((row) => ({ providerId: row.provider_id, model: row.model_id })),
        clusters: clusters.rows.map((row) => row.cluster_id),
      };
    },

    async grant(organizationId: string, target: AiGrantTarget, grantedBy: string): Promise<void> {
      const [kind, providerId, model, clusterId] = grantValues(target);
      if (kind === "provider") {
        await pool.query(
          `INSERT INTO ai_provider_grants (organization_id, provider_id, granted_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (organization_id, provider_id) DO NOTHING`,
          [organizationId, providerId, grantedBy],
        );
        return;
      }
      if (kind === "model") {
        await pool.query(
          `INSERT INTO ai_model_grants (organization_id, provider_id, model_id, granted_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (organization_id, provider_id, model_id) DO NOTHING`,
          [organizationId, providerId, model, grantedBy],
        );
        return;
      }
      await pool.query(
        `INSERT INTO ai_cluster_grants (organization_id, cluster_id, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, cluster_id) DO NOTHING`,
        [organizationId, clusterId, grantedBy],
      );
    },

    async revoke(organizationId: string, target: AiGrantTarget): Promise<void> {
      if (target.kind === "provider") {
        await pool.query(
          "DELETE FROM ai_provider_grants WHERE organization_id = $1 AND provider_id = $2",
          [organizationId, target.providerId],
        );
        return;
      }
      if (target.kind === "model") {
        await pool.query(
          `DELETE FROM ai_model_grants
            WHERE organization_id = $1 AND provider_id = $2 AND model_id = $3`,
          [organizationId, target.providerId, target.model],
        );
        return;
      }
      await pool.query(
        "DELETE FROM ai_cluster_grants WHERE organization_id = $1 AND cluster_id = $2",
        [organizationId, target.clusterId],
      );
    },

    async countUsage(organizationId: string, target: AiGrantTarget): Promise<number> {
      if (target.kind === "provider") {
        const { rows } = await pool.query<{ count: string }>(
          `SELECT (
             (SELECT count(*) FROM chat_links
               WHERE organization_id = $1 AND ai_provider_id = $2)
             + (SELECT count(*) FROM organization_ai_settings
                 WHERE organization_id = $1 AND default_provider_id = $2)
             + (SELECT count(*) FROM organization_ai_usage_defaults
                 WHERE organization_id = $1 AND provider_id = $2)
             + (SELECT count(*) FROM chat_link_ai_usage_overrides
                 WHERE organization_id = $1 AND provider_id = $2)
             + (SELECT count(*) FROM ai_cluster_members cm
                  JOIN ai_clusters c ON c.id = cm.cluster_id
                 WHERE c.organization_id = $1 AND cm.provider_id = $2)
           )::text AS count`,
          [organizationId, target.providerId],
        );
        return Number(rows[0]?.count ?? "0");
      }
      if (target.kind === "model") {
        const { rows } = await pool.query<{ count: string }>(
          `SELECT (
             (SELECT count(*) FROM chat_links
               WHERE organization_id = $1 AND ai_provider_id = $2 AND ai_model = $3)
             + (SELECT count(*) FROM organization_ai_settings
                 WHERE organization_id = $1 AND default_provider_id = $2 AND default_model = $3)
             + (SELECT count(*) FROM organization_ai_usage_defaults
                 WHERE organization_id = $1 AND provider_id = $2 AND model = $3)
             + (SELECT count(*) FROM chat_link_ai_usage_overrides
                 WHERE organization_id = $1 AND provider_id = $2 AND model = $3)
             + (SELECT count(*) FROM ai_cluster_members cm
                  JOIN ai_clusters c ON c.id = cm.cluster_id
                 WHERE c.organization_id = $1 AND cm.provider_id = $2 AND cm.model = $3)
           )::text AS count`,
          [organizationId, target.providerId, target.model],
        );
        return Number(rows[0]?.count ?? "0");
      }
      const { rows } = await pool.query<{ count: string }>(
        `SELECT (
           (SELECT count(*) FROM organization_ai_usage_defaults
             WHERE organization_id = $1 AND cluster_id = $2)
           + (SELECT count(*) FROM chat_link_ai_usage_overrides
               WHERE organization_id = $1 AND cluster_id = $2)
         )::text AS count`,
        [organizationId, target.clusterId],
      );
      return Number(rows[0]?.count ?? "0");
    },
  };
}
