import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEGACY_ORGANIZATION_ID } from "@/domain/tenant";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { provisionOrganizationDefaults } from "@/infrastructure/db/tenant-provisioning";
import { addMembership, makeOrganization, makeUser, setupDb } from "./helpers/db";

let pool: Pool;

beforeAll(async () => {
  pool = await setupDb();
  await pool.query(
    `INSERT INTO visual_templates (id, key, name)
     VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'demo', 'Demo')`,
  );
});

afterAll(async () => {
  await pool.end();
});

describe("provisioning d'organisation vide (ADR-0025 §7/§9)", () => {
  it("clone 3 modèles + versions + politique par défaut et assigne les templates visuels", async () => {
    const organizationId = await makeOrganization(pool, "Nouvelle org");
    await provisionOrganizationDefaults(pool, organizationId);

    const templates = await pool.query<{ key: string }>(
      "SELECT key FROM chat_templates WHERE organization_id = $1 ORDER BY key",
      [organizationId],
    );
    expect(templates.rows.map((row) => row.key)).toEqual([
      "fiche-projet",
      "investisseur",
      "presentation",
    ]);
    const versions = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM chat_template_versions v
         JOIN chat_templates t ON t.id = v.template_id
        WHERE t.organization_id = $1`,
      [organizationId],
    );
    expect(versions.rows[0]?.count).toBe(3);

    const policies = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM confidentialites WHERE organization_id = $1",
      [organizationId],
    );
    expect(policies.rows[0]?.count).toBe(1);

    const assigned = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM organization_visual_templates WHERE organization_id = $1",
      [organizationId],
    );
    expect(assigned.rows[0]?.count).toBe(1);

    // Aucune donnée métier clonée.
    for (const table of [
      "prospects",
      "chat_links",
      "conversations",
      "fiches",
      "medias",
      "base_connaissances",
    ]) {
      const { rows } = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM ${table} WHERE organization_id = $1`,
        [organizationId],
      );
      expect(rows[0]?.count).toBe(0);
    }
  });

  it("est idempotent (aucun doublon au second appel)", async () => {
    const organizationId = await makeOrganization(pool, "Org idempotente");
    await provisionOrganizationDefaults(pool, organizationId);
    await provisionOrganizationDefaults(pool, organizationId);
    const { rows } = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM chat_templates WHERE organization_id = $1",
      [organizationId],
    );
    expect(rows[0]?.count).toBe(3);
  });

  it("l'organisation legacy Onirtech existe et porte les données seedées", async () => {
    const { rows } = await pool.query<{ name: string }>(
      "SELECT name FROM organizations WHERE id = $1",
      [LEGACY_ORGANIZATION_ID],
    );
    expect(rows[0]?.name).toBe("Onirtech");
  });
});

describe("memberships SQL", () => {
  it("upsert, rôle, comptage et retrait", async () => {
    const repo = pgMembershipRepository(pool);
    const organizationId = await makeOrganization(pool, "Org members");
    const user1 = await makeUser(pool, "m1@example.com");
    const user2 = await makeUser(pool, "m2@example.com");

    await repo.upsert({ organizationId, userId: user1, role: "admin", createdBy: null });
    await repo.upsert({ organizationId, userId: user2, role: "lecteur", createdBy: null });
    expect(await repo.findRole(organizationId, user1)).toBe("admin");
    expect(await repo.countAdmins(organizationId)).toBe(1);
    expect(await repo.countForUser(user1)).toBe(1);

    await repo.updateRole(organizationId, user2, "marketeur");
    expect(await repo.findRole(organizationId, user2)).toBe("marketeur");

    expect(await repo.remove(organizationId, user2)).toBe(true);
    expect(await repo.findRole(organizationId, user2)).toBeNull();
  });

  it("plusieurs organisations par utilisateur avec des rôles différents", async () => {
    const repo = pgMembershipRepository(pool);
    const org1 = await makeOrganization(pool, "Multi 1");
    const org2 = await makeOrganization(pool, "Multi 2");
    const user = await makeUser(pool, "multi@example.com");
    await addMembership(pool, org1, user, "admin");
    await addMembership(pool, org2, user, "lecteur");
    expect(await repo.findRole(org1, user)).toBe("admin");
    expect(await repo.findRole(org2, user)).toBe("lecteur");
    expect(await repo.listForUser(user)).toHaveLength(2);
  });
});

describe("organisations SQL — suspension et liste", () => {
  it("suspend / réactive et filtre par membership", async () => {
    const repo = pgOrganizationRepository(pool);
    const organization = await repo.create({ name: "Org suspendue", createdBy: null });
    const suspended = await repo.setSuspended(organization.id, true);
    expect(suspended?.suspendedAt).not.toBeNull();
    const reactivated = await repo.setSuspended(organization.id, false);
    expect(reactivated?.suspendedAt).toBeNull();

    const user = await makeUser(pool, "list@example.com");
    await addMembership(pool, organization.id, user);
    expect((await repo.listForUser(user)).map((item) => item.id)).toContain(organization.id);
    expect((await repo.listAll()).map((item) => item.id)).toContain(organization.id);
  });
});
