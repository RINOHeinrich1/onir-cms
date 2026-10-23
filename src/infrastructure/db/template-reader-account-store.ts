import type { Pool } from "pg";
import type { TemplateReaderAccountStore } from "@/application/ports/template-reader-account-store";
import {
  saveReaderCredentials,
  updateReaderPolicy,
} from "./template-reader-credentials-repository";
import { provisionReaderAccount, setReaderValidity } from "./template-reader-provisioner";

/**
 * Rotation atomique : rôle PostgreSQL et secret chiffré dans la même
 * transaction. Un échec ou un arrêt du process annule les deux.
 */
export function pgTemplateReaderAccountStore(pool: Pool): TemplateReaderAccountStore {
  return {
    async rotate(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await provisionReaderAccount(client, input.password, input.validUntil);
        const credentials = await saveReaderCredentials(client, {
          sealed: input.sealed,
          actorId: input.actorId,
          validityDays: input.validityDays,
          expiresAt: input.expiresAt,
        });
        await client.query("COMMIT");
        return credentials;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async setValidity(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setReaderValidity(client, input.validUntil);
        const credentials = await updateReaderPolicy(client, {
          validityDays: input.validityDays,
          expiresAt: input.expiresAt,
          actorId: input.actorId,
        });
        await client.query("COMMIT");
        return credentials;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
