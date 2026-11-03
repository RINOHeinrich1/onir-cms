import type { Pool } from "pg";
import type { OrganizationSettingsRepository } from "@/application/ports/organization-settings-repository";

export const DEFAULT_EXPIRATION_ALERT_DAYS = 7;

/** Adapter PostgreSQL des réglages d'organisation. */
export function pgOrganizationSettingsRepository(pool: Pool): OrganizationSettingsRepository {
  return {
    async getExpirationAlertDays(organizationId): Promise<number> {
      const { rows } = await pool.query<{ expiration_alert_days: number }>(
        `SELECT expiration_alert_days FROM organizations WHERE id = $1`,
        [organizationId],
      );
      return rows[0]?.expiration_alert_days ?? DEFAULT_EXPIRATION_ALERT_DAYS;
    },

    async setExpirationAlertDays(organizationId, days): Promise<number> {
      const { rows } = await pool.query<{ expiration_alert_days: number }>(
        `UPDATE organizations
            SET expiration_alert_days = $1,
                updated_at = now()
          WHERE id = $2
          RETURNING expiration_alert_days`,
        [days, organizationId],
      );
      const row = rows[0];
      if (row === undefined) throw new Error("Organisation introuvable");
      return row.expiration_alert_days;
    },
  };
}
