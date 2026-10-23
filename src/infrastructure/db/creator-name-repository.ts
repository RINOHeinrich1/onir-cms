import type { Pool } from "pg";
import type {
  CreatorName,
  CreatorNameRepository,
} from "@/application/ports/creator-name-repository";

type Row = {
  id: string;
  name: string | null;
  email: string;
};

export function pgCreatorNameRepository(pool: Pool): CreatorNameRepository {
  return {
    async listByIds(ids: readonly string[]): Promise<CreatorName[]> {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) return [];
      const { rows } = await pool.query<Row>(
        "SELECT id, name, email FROM users WHERE id = ANY($1::uuid[])",
        [uniqueIds],
      );
      return rows;
    },
  };
}
