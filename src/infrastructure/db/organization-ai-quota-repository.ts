import type { Pool, PoolClient } from "pg";
import type {
  OrganizationAiQuotaRepository,
  OrganizationLimits,
  SaveOrganizationLimitsInput,
} from "@/application/ports/organization-ai-quota-repository";
import type { TokenResetMode } from "@/domain/entities/chat";
import {
  normalizeTokenCount,
  type OrganizationAiAllocation,
  type OrganizationAiAllocationOverview,
  type OrganizationAiBudget,
  type OrganizationAiQuotaState,
  type OrganizationAiTarget,
  type OrganizationAiUsageEvent,
  type OrganizationAiUsageOverview,
  organizationAiTargetKey,
} from "@/domain/entities/organization-ai-quota";

type BudgetRow = {
  organization_id: string;
  max_tokens: string | null;
  tokens_used: string;
  max_messages: string | null;
  messages_used: string;
  token_reset_mode: string;
  token_reset_days: number | null;
  token_period_started_at: Date;
};

type AllocationRow = {
  id: string;
  organization_id: string;
  target_kind: string;
  provider_id: string | null;
  model: string | null;
  cluster_id: string | null;
  max_tokens: string | null;
  tokens_used: string;
};

type OrganizationRow = {
  max_chatbots: number | null;
  limit_profile_id: string | null;
  chatbots_count: number;
};

type AllocationOverviewRow = AllocationRow & { label: string };

function tokenNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function resetMode(value: string): TokenResetMode {
  return value === "duration" ? "duration" : "manual";
}

function targetFromRow(row: AllocationRow): OrganizationAiTarget {
  if (row.target_kind === "cluster") {
    return { kind: "cluster", clusterId: row.cluster_id ?? "" };
  }
  return {
    kind: "model",
    providerId: row.provider_id ?? "",
    model: row.model ?? "",
  };
}

function budgetFromRow(row: BudgetRow): OrganizationAiBudget {
  return {
    organizationId: row.organization_id,
    maxTokens: tokenNumber(row.max_tokens),
    tokensUsed: Number(row.tokens_used),
    maxMessages: tokenNumber(row.max_messages),
    messagesUsed: Number(row.messages_used),
    tokenResetMode: resetMode(row.token_reset_mode),
    tokenResetDays: row.token_reset_days,
    tokenPeriodStartedAt: row.token_period_started_at.toISOString(),
  };
}

function allocationFromRow(row: AllocationRow): OrganizationAiAllocation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    target: targetFromRow(row),
    maxTokens: tokenNumber(row.max_tokens),
    tokensUsed: Number(row.tokens_used),
  };
}

function allocationOverviewFromRow(row: AllocationOverviewRow): OrganizationAiAllocationOverview {
  return { ...allocationFromRow(row), label: row.label };
}

function periodExpired(budget: BudgetRow, now: Date): boolean {
  if (budget.token_reset_mode !== "duration" || budget.token_reset_days === null) return false;
  const end = new Date(budget.token_period_started_at);
  end.setUTCDate(end.getUTCDate() + budget.token_reset_days);
  return end.getTime() <= now.getTime();
}

async function resetExpiredBudget(client: PoolClient, organizationId: string): Promise<void> {
  const { rows } = await client.query<BudgetRow>(
    `SELECT organization_id, max_tokens, tokens_used, max_messages, messages_used, token_reset_mode,
            token_reset_days, token_period_started_at
       FROM organization_ai_budgets
      WHERE organization_id = $1
      FOR UPDATE`,
    [organizationId],
  );
  const budget = rows[0];
  if (budget === undefined || !periodExpired(budget, new Date())) return;

  await client.query(
    `UPDATE organization_ai_budgets
        SET tokens_used = 0, messages_used = 0, token_period_started_at = now(), updated_at = now()
      WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `UPDATE organization_ai_allocations
        SET tokens_used = 0, updated_at = now()
      WHERE organization_id = $1`,
    [organizationId],
  );
}

async function readStateWithClient(
  client: PoolClient,
  organizationId: string,
): Promise<OrganizationAiQuotaState> {
  await resetExpiredBudget(client, organizationId);
  const [budgetRows, allocationRows] = await Promise.all([
    client.query<BudgetRow>(
      `SELECT organization_id, max_tokens, tokens_used, max_messages, messages_used, token_reset_mode,
              token_reset_days, token_period_started_at
         FROM organization_ai_budgets
        WHERE organization_id = $1`,
      [organizationId],
    ),
    client.query<AllocationRow>(
      `SELECT id, organization_id, target_kind, provider_id, model,
              cluster_id, max_tokens, tokens_used
         FROM organization_ai_allocations
        WHERE organization_id = $1
        ORDER BY created_at, id`,
      [organizationId],
    ),
  ]);
  const budget = budgetRows.rows[0];
  return {
    budget: budget === undefined ? null : budgetFromRow(budget),
    allocations: allocationRows.rows.map(allocationFromRow),
  };
}

async function getLimitsWithClient(
  client: PoolClient,
  organizationId: string,
): Promise<OrganizationLimits | null> {
  const organization = await client.query<OrganizationRow>(
    `SELECT o.max_chatbots, o.limit_profile_id,
            (SELECT count(*)::int FROM chat_links l WHERE l.organization_id = o.id) AS chatbots_count
       FROM organizations o
      WHERE o.id = $1`,
    [organizationId],
  );
  const row = organization.rows[0];
  if (row === undefined) return null;
  const state = await readStateWithClient(client, organizationId);
  return {
    organizationId,
    maxChatbots: row.max_chatbots,
    limitProfileId: row.limit_profile_id,
    chatbotsCount: row.chatbots_count,
    budget: state.budget,
    allocations: state.allocations,
  };
}

/**
 * Adapter PostgreSQL des quotas d'organisation (ADR-0065).
 * Aucun compteur existant (`chat_links.tokens_used`) n'est lu ni modifié ici.
 */
export function pgOrganizationAiQuotaRepository(pool: Pool): OrganizationAiQuotaRepository {
  async function readState(organizationId: string): Promise<OrganizationAiQuotaState> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const state = await readStateWithClient(client, organizationId);
      await client.query("COMMIT");
      return state;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function getLimits(organizationId: string): Promise<OrganizationLimits | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const limits = await getLimitsWithClient(client, organizationId);
      await client.query("COMMIT");
      return limits;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function getUsageOverview(organizationId: string): Promise<OrganizationAiUsageOverview> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await resetExpiredBudget(client, organizationId);
      const budgetRows = await client.query<BudgetRow>(
        `SELECT organization_id, max_tokens, tokens_used, max_messages, messages_used, token_reset_mode,
                token_reset_days, token_period_started_at
           FROM organization_ai_budgets
          WHERE organization_id = $1`,
        [organizationId],
      );
      const totalRows = await client.query<{ total: string }>(
        `WITH live AS (
           SELECT min(created_at) AS at
             FROM ai_usage_events
            WHERE source = 'live'
         ),
         cutover AS (
           SELECT COALESCE((SELECT at FROM live), now()) AS applied_at
         )
         SELECT (
           COALESCE((
             SELECT sum(total_tokens)
               FROM ai_usage_events
              WHERE organization_id = $1
           ), 0)
           +
           COALESCE((
             SELECT sum(u.total_tokens)
               FROM chat_link_ai_usage u
               CROSS JOIN cutover c
              WHERE u.organization_id = $1
                AND u.created_at < c.applied_at
                AND NOT EXISTS (
                  SELECT 1
                    FROM ai_usage_events e
                   WHERE e.legacy_usage_id = u.id
                )
           ), 0)
         )::text AS total`,
        [organizationId],
      );
      const allocationRows = await client.query<AllocationOverviewRow>(
        `SELECT a.id, a.organization_id, a.target_kind, a.provider_id, a.model,
                a.cluster_id, a.max_tokens, a.tokens_used,
                CASE
                  WHEN a.target_kind = 'cluster'
                    THEN COALESCE(NULLIF(c.label, ''), 'Cluster IA')
                  WHEN p.label IS NULL OR p.label = ''
                    THEN a.model
                  ELSE p.label || ' · ' || a.model
                END AS label
           FROM organization_ai_allocations a
           LEFT JOIN ai_providers p ON p.id = a.provider_id
           LEFT JOIN ai_clusters c ON c.id = a.cluster_id
          WHERE a.organization_id = $1
          ORDER BY a.created_at, a.id`,
        [organizationId],
      );
      const budget = budgetRows.rows[0];
      await client.query("COMMIT");
      return {
        organizationId,
        totalTokens: Number(totalRows.rows[0]?.total ?? 0),
        budget: budget === undefined ? null : budgetFromRow(budget),
        allocations: allocationRows.rows.map(allocationOverviewFromRow),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    readState,
    getUsageOverview,

    async recordUsage(event: OrganizationAiUsageEvent): Promise<void> {
      const promptTokens = normalizeTokenCount(event.promptTokens);
      const completionTokens = normalizeTokenCount(event.completionTokens);
      const totalTokens = normalizeTokenCount(event.totalTokens);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await resetExpiredBudget(client, event.organizationId);
        await client.query(
          `INSERT INTO ai_usage_events
             (organization_id, provider_id, provider_label, model, cluster_id,
              usage, link_id, conversation_id, user_id,
              prompt_tokens, completion_tokens, total_tokens)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            event.organizationId,
            event.providerId,
            event.providerLabel,
            event.model,
            event.clusterId,
            event.usage,
            event.linkId ?? null,
            event.conversationId ?? null,
            event.userId ?? null,
            promptTokens,
            completionTokens,
            totalTokens,
          ],
        );
        await client.query(
          `UPDATE organization_ai_budgets
              SET tokens_used = tokens_used + $2, updated_at = now()
            WHERE organization_id = $1`,
          [event.organizationId, totalTokens],
        );
        if (event.clusterId !== null) {
          await client.query(
            `UPDATE organization_ai_allocations
                SET tokens_used = tokens_used + $3, updated_at = now()
              WHERE organization_id = $1 AND target_kind = 'cluster' AND cluster_id = $2`,
            [event.organizationId, event.clusterId, totalTokens],
          );
        }
        if (event.providerId !== null) {
          await client.query(
            `UPDATE organization_ai_allocations
                SET tokens_used = tokens_used + $4, updated_at = now()
              WHERE organization_id = $1 AND target_kind = 'model'
                AND provider_id = $2 AND model = $3`,
            [event.organizationId, event.providerId, event.model, totalTokens],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    getLimits,

    async saveLimits(
      organizationId: string,
      input: SaveOrganizationLimitsInput,
    ): Promise<OrganizationLimits | null> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const organization = await client.query(
          `UPDATE organizations
              SET max_chatbots = $2, updated_at = now()
            WHERE id = $1
            RETURNING id`,
          [organizationId, input.maxChatbots],
        );
        if (organization.rowCount === 0) {
          await client.query("ROLLBACK");
          return null;
        }

        await client.query(
          `INSERT INTO organization_ai_budgets
             (organization_id, max_tokens, max_messages, token_reset_mode, token_reset_days)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (organization_id) DO UPDATE
             SET max_tokens = EXCLUDED.max_tokens,
                 max_messages = EXCLUDED.max_messages,
                 token_reset_mode = EXCLUDED.token_reset_mode,
                 token_reset_days = EXCLUDED.token_reset_days,
                 updated_at = now()`,
          [
            organizationId,
            input.maxTokens,
            input.maxMessages ?? null,
            input.tokenResetMode,
            input.tokenResetMode === "duration" ? input.tokenResetDays : null,
          ],
        );

        const existing = await client.query<AllocationRow>(
          `SELECT id, organization_id, target_kind, provider_id, model,
                  cluster_id, max_tokens, tokens_used
             FROM organization_ai_allocations
            WHERE organization_id = $1
            FOR UPDATE`,
          [organizationId],
        );
        const desiredKeys = new Set(
          input.allocations.map((allocation) => organizationAiTargetKey(allocation.target)),
        );
        const existingByKey = new Map<string, AllocationRow>();
        for (const row of existing.rows) {
          const allocation = allocationFromRow(row);
          existingByKey.set(organizationAiTargetKey(allocation.target), row);
          if (!desiredKeys.has(organizationAiTargetKey(allocation.target))) {
            await client.query("DELETE FROM organization_ai_allocations WHERE id = $1", [row.id]);
          }
        }

        for (const allocation of input.allocations) {
          const key = organizationAiTargetKey(allocation.target);
          const row = existingByKey.get(key);
          if (row !== undefined) {
            await client.query(
              `UPDATE organization_ai_allocations
                  SET max_tokens = $2, updated_at = now()
                WHERE id = $1`,
              [row.id, allocation.maxTokens],
            );
            continue;
          }
          if (allocation.target.kind === "model") {
            await client.query(
              `INSERT INTO organization_ai_allocations
                 (organization_id, target_kind, provider_id, model, max_tokens)
               VALUES ($1, 'model', $2, $3, $4)`,
              [
                organizationId,
                allocation.target.providerId,
                allocation.target.model,
                allocation.maxTokens,
              ],
            );
          } else {
            await client.query(
              `INSERT INTO organization_ai_allocations
                 (organization_id, target_kind, cluster_id, max_tokens)
               VALUES ($1, 'cluster', $2, $3)`,
              [organizationId, allocation.target.clusterId, allocation.maxTokens],
            );
          }
        }

        const limits = await getLimitsWithClient(client, organizationId);
        await client.query("COMMIT");
        return limits;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async consumeMessage(organizationId: string): Promise<{
      allowed: boolean;
      maxMessages: number | null;
      messagesUsed: number;
    }> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await resetExpiredBudget(client, organizationId);
        const { rows } = await client.query<BudgetRow>(
          `SELECT organization_id, max_tokens, tokens_used, max_messages, messages_used,
                  token_reset_mode, token_reset_days, token_period_started_at
             FROM organization_ai_budgets
            WHERE organization_id = $1
            FOR UPDATE`,
          [organizationId],
        );
        const budget = rows[0];
        if (budget === undefined) {
          await client.query("COMMIT");
          return { allowed: true, maxMessages: null, messagesUsed: 0 };
        }
        const maxMessages = tokenNumber(budget.max_messages);
        const messagesUsed = Number(budget.messages_used);
        if (maxMessages !== null && messagesUsed >= maxMessages) {
          await client.query("COMMIT");
          return { allowed: false, maxMessages, messagesUsed };
        }
        await client.query(
          `UPDATE organization_ai_budgets
              SET messages_used = messages_used + 1, updated_at = now()
            WHERE organization_id = $1`,
          [organizationId],
        );
        await client.query("COMMIT");
        return { allowed: true, maxMessages, messagesUsed: messagesUsed + 1 };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async resetBudget(organizationId: string): Promise<boolean> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const budget = await client.query(
          `UPDATE organization_ai_budgets
              SET tokens_used = 0, messages_used = 0, token_period_started_at = now(), updated_at = now()
            WHERE organization_id = $1
            RETURNING organization_id`,
          [organizationId],
        );
        if (budget.rowCount === 0) {
          await client.query("ROLLBACK");
          return false;
        }
        await client.query(
          `UPDATE organization_ai_allocations
              SET tokens_used = 0, updated_at = now()
            WHERE organization_id = $1`,
          [organizationId],
        );
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
