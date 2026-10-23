import type { Pool } from "pg";
import type {
  CreateUserInput,
  UpdateUserInput,
  UserRepository,
  UserWithCredentials,
} from "@/application/ports/user-repository";
import { parseRole, type User } from "@/domain/entities/user";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  password_hash: string;
  role: string;
  is_super_admin: boolean;
  last_active_organization_id: string | null;
  must_change_password: boolean;
  actif: boolean;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS =
  "id, email, name, password_hash, role, is_super_admin, last_active_organization_id, must_change_password, actif, created_at, updated_at";

function toCredentials(row: UserRow): UserWithCredentials {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    role: parseRole(row.role),
    isSuperAdmin: row.is_super_admin,
    lastActiveOrganizationId: row.last_active_organization_id,
    mustChangePassword: row.must_change_password,
    actif: row.actif,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Variante publique : ne JAMAIS exposer le hash hors des flux d'authentification. */
function toPublic(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: parseRole(row.role),
    isSuperAdmin: row.is_super_admin,
    lastActiveOrganizationId: row.last_active_organization_id,
    mustChangePassword: row.must_change_password,
    actif: row.actif,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL du port `UserRepository` (A021, étendu ADR-0025). */
export function pgUserRepository(pool: Pool): UserRepository {
  return {
    async findById(id): Promise<UserWithCredentials | null> {
      const { rows } = await pool.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [
        id,
      ]);
      const row = rows[0];
      return row ? toCredentials(row) : null;
    },

    async findByEmail(email): Promise<UserWithCredentials | null> {
      const { rows } = await pool.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [
        email,
      ]);
      const row = rows[0];
      return row ? toCredentials(row) : null;
    },

    async list(): Promise<User[]> {
      const { rows } = await pool.query<UserRow>(`SELECT ${COLUMNS} FROM users ORDER BY email ASC`);
      return rows.map((row) => toPublic(row));
    },

    async listAll(): Promise<User[]> {
      const { rows } = await pool.query<UserRow>(`SELECT ${COLUMNS} FROM users ORDER BY email ASC`);
      return rows.map((row) => toPublic(row));
    },

    async create(input: CreateUserInput): Promise<User> {
      const { rows } = await pool.query<UserRow>(
        `INSERT INTO users (email, name, password_hash, role, is_super_admin, must_change_password, actif)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${COLUMNS}`,
        [
          input.email,
          input.name ?? null,
          input.passwordHash,
          input.role,
          input.isSuperAdmin ?? false,
          input.mustChangePassword,
          input.actif,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de l'utilisateur");
      return toPublic(row);
    },

    async update(id, patch: UpdateUserInput): Promise<User | null> {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (column: string, value: unknown): void => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };

      if (patch.name !== undefined) push("name", patch.name);
      if (patch.role !== undefined) push("role", patch.role);
      if (patch.actif !== undefined) push("actif", patch.actif);
      if (patch.passwordHash !== undefined) push("password_hash", patch.passwordHash);
      if (patch.mustChangePassword !== undefined) {
        push("must_change_password", patch.mustChangePassword);
      }
      if (patch.isSuperAdmin !== undefined) push("is_super_admin", patch.isSuperAdmin);
      if (patch.lastActiveOrganizationId !== undefined) {
        push("last_active_organization_id", patch.lastActiveOrganizationId);
      }

      if (sets.length === 0) {
        const { rows } = await pool.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [
          id,
        ]);
        const row = rows[0];
        return row ? toPublic(row) : null;
      }

      push("updated_at", new Date());
      values.push(id);
      const { rows } = await pool.query<UserRow>(
        `UPDATE users SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${COLUMNS}`,
        values,
      );
      const row = rows[0];
      return row ? toPublic(row) : null;
    },

    async delete(id): Promise<boolean> {
      const result = await pool.query("DELETE FROM users WHERE id = $1", [id]);
      return (result.rowCount ?? 0) > 0;
    },

    async updateLastOrganization(id, organizationId): Promise<void> {
      await pool.query(
        "UPDATE users SET last_active_organization_id = $1, updated_at = now() WHERE id = $2",
        [organizationId, id],
      );
    },

    async countSuperAdmins(): Promise<number> {
      const { rows } = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM users WHERE is_super_admin = true",
      );
      return rows[0]?.count ?? 0;
    },
  };
}
