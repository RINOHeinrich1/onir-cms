import type { Pool } from "pg";
import { StorageQuotaExceededError } from "@/application/errors";
import type { StorageQuotaRepository } from "@/application/ports/storage-quota-repository";

export function pgStorageQuotaRepository(pool: Pool): StorageQuotaRepository {
  return {
    async assertCanStore(organizationId, incomingBytes): Promise<void> {
      const { rows } = await pool.query<{ max_storage_bytes: string | null; used_bytes: string }>(
        `SELECT o.max_storage_bytes,
                (
                  COALESCE((SELECT sum(a.size_bytes) FROM conversation_attachments a WHERE a.organization_id = o.id), 0)
                  + COALESCE((SELECT sum(t.size_bytes) FROM template_param_assets t WHERE t.organization_id = o.id), 0)
                  + COALESCE((SELECT sum(m.size_bytes) FROM medias m WHERE m.organization_id = o.id AND m.size_bytes IS NOT NULL), 0)
                )::text AS used_bytes
           FROM organizations o
          WHERE o.id = $1`,
        [organizationId],
      );
      const row = rows[0];
      if (row === undefined || row.max_storage_bytes === null) return;
      const max = Number(row.max_storage_bytes);
      const used = Number(row.used_bytes);
      if (used + incomingBytes > max) {
        throw new StorageQuotaExceededError(
          "Le quota de stockage de cette organisation est atteint. Contactez l'administrateur.",
        );
      }
    },
  };
}
