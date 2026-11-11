import type { Pool } from "pg";

export type PlatformProvisioningRecord = {
  externalRequestId: string;
  organizationId: string | null;
  response: Record<string, unknown> | null;
};

export function pgPlatformProvisioningRepository(pool: Pool) {
  return {
    async find(externalRequestId: string): Promise<PlatformProvisioningRecord | null> {
      const { rows } = await pool.query<{
        external_request_id: string;
        organization_id: string | null;
        response: Record<string, unknown> | null;
      }>(
        `SELECT external_request_id, organization_id, response
           FROM platform_provisioning_requests
          WHERE external_request_id = $1`,
        [externalRequestId],
      );
      const row = rows[0];
      return row === undefined
        ? null
        : {
            externalRequestId: row.external_request_id,
            organizationId: row.organization_id,
            response: row.response,
          };
    },

    async save(input: {
      externalRequestId: string;
      organizationId: string;
      response: Record<string, unknown>;
    }): Promise<void> {
      await pool.query(
        `INSERT INTO platform_provisioning_requests
           (external_request_id, organization_id, response, updated_at)
         VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (external_request_id) DO UPDATE
           SET organization_id = EXCLUDED.organization_id,
               response = EXCLUDED.response,
               updated_at = now()`,
        [input.externalRequestId, input.organizationId, JSON.stringify(input.response)],
      );
    },
  };
}
