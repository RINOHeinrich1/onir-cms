import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invitationStatus } from "@/domain/entities/invitation";
import { hashPassword } from "@/domain/password";
import { pgInvitationRepository } from "@/infrastructure/db/invitation-repository";
import { createInvitationToken, hashInvitationToken } from "@/lib/invitation-token";
import { encryptLinkToken } from "@/lib/link-crypto";
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

async function seedInvitation(
  organizationId: string | null,
  role: "admin" | "marketeur" | "lecteur",
  options: { invitedBy: string; expiresAt?: Date },
): Promise<string> {
  const token = createInvitationToken();
  await pool.query(
    `INSERT INTO organization_invitations
       (token_hash, token_enc, organization_id, role, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      hashInvitationToken(token),
      encryptLinkToken(token),
      organizationId,
      role,
      options.invitedBy,
      options.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ],
  );
  return token;
}

describe("invitations — persistance et statuts", () => {
  it("crée, relit, liste et révoque une invitation", async () => {
    const repo = pgInvitationRepository(pool);
    const organizationId = await makeOrganization(pool, "Org invitations");
    const admin = await makeUser(pool, "inviter@example.com");
    const token = createInvitationToken();
    const created = await repo.create({
      tokenHash: hashInvitationToken(token),
      tokenEnc: encryptLinkToken(token),
      organizationId,
      role: "marketeur",
      invitedBy: admin,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    expect(created.organizationName).toBe("Org invitations");
    expect(created.role).toBe("marketeur");
    expect(created.token).toBe(token);
    expect(created.invitedByEmail).toBe("inviter@example.com");
    expect(invitationStatus(created)).toBe("pending");

    expect((await repo.findById(created.id))?.id).toBe(created.id);
    expect((await repo.findByTokenHash(hashInvitationToken(token)))?.id).toBe(created.id);
    expect(await repo.listForOrganization(organizationId)).toHaveLength(1);
    expect((await repo.listAll()).length).toBeGreaterThanOrEqual(1);

    expect(await repo.revoke(created.id)).toBe(true);
    const revoked = await repo.findById(created.id);
    expect(invitationStatus(revoked as NonNullable<typeof revoked>)).toBe("revoked");
    expect(await repo.revoke(created.id)).toBe(false);
  });

  it("refuse une organisation nulle avec un rôle non admin (contrainte SQL)", async () => {
    const admin = await makeUser(pool, "constraint@example.com");
    await expect(seedInvitation(null, "lecteur", { invitedBy: admin })).rejects.toThrow();
  });
});

describe("acceptation d'invitation", () => {
  it("rattache un nouvel utilisateur à l'organisation invitante", async () => {
    const repo = pgInvitationRepository(pool);
    const organizationId = await makeOrganization(pool, "Org cible");
    const admin = await makeUser(pool, "admin-cible@example.com");
    await addMembership(pool, organizationId, admin);
    const token = await seedInvitation(organizationId, "lecteur", { invitedBy: admin });

    const result = await repo.accept({
      tokenHash: hashInvitationToken(token),
      name: "Nouvelle Personne",
      email: "Nouvelle.Personne@Example.com",
      password: "motdepasse123",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.organizationId).toBe(organizationId);
    expect(result.role).toBe("lecteur");
    expect(result.mustChangePassword).toBe(false);

    const user = await pool.query<{
      name: string;
      email: string;
      last_active_organization_id: string;
    }>("SELECT name, email, last_active_organization_id FROM users WHERE id = $1", [result.userId]);
    expect(user.rows[0]?.email).toBe("nouvelle.personne@example.com");
    expect(user.rows[0]?.name).toBe("Nouvelle Personne");
    expect(user.rows[0]?.last_active_organization_id).toBe(organizationId);

    const membership = await pool.query<{ role: string }>(
      "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2",
      [organizationId, result.userId],
    );
    expect(membership.rows[0]?.role).toBe("lecteur");
  });

  it("authentifie un compte existant (bon mot de passe) et refuse un mauvais mot de passe", async () => {
    const repo = pgInvitationRepository(pool);
    const organizationId = await makeOrganization(pool, "Org existante");
    const admin = await makeUser(pool, "admin-existant@example.com");
    await addMembership(pool, organizationId, admin);
    const existing = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, must_change_password, actif)
       VALUES ('deja@example.com', $1, 'lecteur', true, true) RETURNING id`,
      [hashPassword("motdepasse123")],
    );
    const existingId = existing.rows[0]?.id;
    if (existingId === undefined) throw new Error("échec fixture");

    const wrong = await seedInvitation(organizationId, "lecteur", { invitedBy: admin });
    const refused = await repo.accept({
      tokenHash: hashInvitationToken(wrong),
      name: "Dejà Là",
      email: "deja@example.com",
      password: "mauvais-mot-de-passe",
    });
    expect(refused).toEqual({ ok: false, reason: "invalid_credentials" });

    const good = await seedInvitation(organizationId, "lecteur", { invitedBy: admin });
    const accepted = await repo.accept({
      tokenHash: hashInvitationToken(good),
      name: "Dejà Là",
      email: "deja@example.com",
      password: "motdepasse123",
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.userId).toBe(existingId);
    expect(accepted.mustChangePassword).toBe(true);
  });

  it("refuse un membre déjà rattaché à l'organisation", async () => {
    const repo = pgInvitationRepository(pool);
    const organizationId = await makeOrganization(pool, "Org doublon");
    const admin = await makeUser(pool, "admin-doublon@example.com");
    await addMembership(pool, organizationId, admin);
    const member = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, actif)
       VALUES ('membre@example.com', $1, 'lecteur', true) RETURNING id`,
      [hashPassword("motdepasse123")],
    );
    const memberId = member.rows[0]?.id;
    if (memberId === undefined) throw new Error("échec fixture");
    await addMembership(pool, organizationId, memberId, "lecteur");

    const token = await seedInvitation(organizationId, "admin", { invitedBy: admin });
    const result = await repo.accept({
      tokenHash: hashInvitationToken(token),
      name: "Membre Existant",
      email: "membre@example.com",
      password: "motdepasse123",
    });
    expect(result).toEqual({ ok: false, reason: "already_member" });
  });

  it("crée une organisation personnelle provisionnée pour un admin sans organisation", async () => {
    const repo = pgInvitationRepository(pool);
    const admin = await makeUser(pool, "admin-personnel@example.com");
    const token = await seedInvitation(null, "admin", { invitedBy: admin });

    const result = await repo.accept({
      tokenHash: hashInvitationToken(token),
      name: "Admin Personnel",
      email: "personnel@example.com",
      password: "motdepasse123",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.role).toBe("admin");
    expect(result.organizationName).toBe("Admin Personnel");

    const templates = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM chat_templates WHERE organization_id = $1",
      [result.organizationId],
    );
    expect(templates.rows[0]?.count).toBe(3);
    const membership = await pool.query<{ role: string }>(
      "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2",
      [result.organizationId, result.userId],
    );
    expect(membership.rows[0]?.role).toBe("admin");
  });

  it("refuse une invitation expirée, révoquée ou déjà acceptée", async () => {
    const repo = pgInvitationRepository(pool);
    const organizationId = await makeOrganization(pool, "Org statuts");
    const admin = await makeUser(pool, "admin-statuts@example.com");
    await addMembership(pool, organizationId, admin);

    const expiredToken = await seedInvitation(organizationId, "lecteur", {
      invitedBy: admin,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(
      await repo.accept({
        tokenHash: hashInvitationToken(expiredToken),
        name: "Expiré",
        email: "expire@example.com",
        password: "motdepasse123",
      }),
    ).toEqual({ ok: false, reason: "expired" });

    const revokedToken = await seedInvitation(organizationId, "lecteur", { invitedBy: admin });
    const revoked = await repo.findByTokenHash(hashInvitationToken(revokedToken));
    if (revoked === null) throw new Error("échec fixture");
    await repo.revoke(revoked.id);
    expect(
      await repo.accept({
        tokenHash: hashInvitationToken(revokedToken),
        name: "Révoqué",
        email: "revoque@example.com",
        password: "motdepasse123",
      }),
    ).toEqual({ ok: false, reason: "revoked" });

    const reusableToken = await seedInvitation(organizationId, "lecteur", { invitedBy: admin });
    const first = await repo.accept({
      tokenHash: hashInvitationToken(reusableToken),
      name: "Unique",
      email: "unique@example.com",
      password: "motdepasse123",
    });
    expect(first.ok).toBe(true);
    expect(
      await repo.accept({
        tokenHash: hashInvitationToken(reusableToken),
        name: "Second",
        email: "second@example.com",
        password: "motdepasse123",
      }),
    ).toEqual({ ok: false, reason: "already_accepted" });
  });

  it("refuse une organisation suspendue", async () => {
    const repo = pgInvitationRepository(pool);
    const organizationId = await makeOrganization(pool, "Org suspendue invit");
    const admin = await makeUser(pool, "admin-susp@example.com");
    await addMembership(pool, organizationId, admin);
    await pool.query("UPDATE organizations SET suspended_at = now() WHERE id = $1", [
      organizationId,
    ]);
    const token = await seedInvitation(organizationId, "lecteur", { invitedBy: admin });

    expect(
      await repo.accept({
        tokenHash: hashInvitationToken(token),
        name: "Suspendu",
        email: "suspendu@example.com",
        password: "motdepasse123",
      }),
    ).toEqual({ ok: false, reason: "organization_suspended" });
  });
});
