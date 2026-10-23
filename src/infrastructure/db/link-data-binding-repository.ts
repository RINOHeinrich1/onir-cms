import type { Pool } from "pg";
import type { LinkDataBindingRepository } from "@/application/ports/link-data-binding-repository";

export function pgLinkDataBindingRepository(pool: Pool): LinkDataBindingRepository {
  return {
    async list(linkId: string): Promise<Record<string, string>> {
      const { rows } = await pool.query<{ contract_key: string; binding_id: string }>(
        "SELECT contract_key, binding_id FROM chat_link_data_bindings WHERE chat_link_id = $1",
        [linkId],
      );
      return Object.fromEntries(rows.map((row) => [row.contract_key, row.binding_id]));
    },

    async replace(linkId: string, selections: Record<string, string | null>): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM chat_link_data_bindings WHERE chat_link_id = $1", [linkId]);
        for (const [contractKey, bindingId] of Object.entries(selections)) {
          if (bindingId === null) continue;
          await client.query(
            `INSERT INTO chat_link_data_bindings (chat_link_id, contract_key, binding_id)
             VALUES ($1, $2, $3)`,
            [linkId, contractKey, bindingId],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
