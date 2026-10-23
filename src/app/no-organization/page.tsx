import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { switchOrganization } from "@/application/use-cases/organizations/switch-organization";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { LogoutButton } from "@/components/layout/LogoutButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgSessionRepository } from "@/infrastructure/db/session-repository";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aucune organisation",
  robots: { index: false, follow: false },
};

/**
 * État « aucune organisation » (ADR-0025 §4) — page volontairement placée
 * HORS du layout dashboard pour casser la boucle de redirection.
 * Sélectionne automatiquement la première organisation non suspendue.
 */
export default async function NoOrganizationPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (context.user.mustChangePassword) redirect("/change-password");
  if (context.actor.organizationId !== null) redirect("/dashboard");

  const pool = getPool();
  const organizations = pgOrganizationRepository(pool);
  const candidates = (
    context.actor.isSuperAdmin
      ? await organizations.listAll()
      : await organizations.listForUser(context.user.id)
  ).filter((organization) => organization.suspendedAt === null);

  const first = candidates[0];
  if (first !== undefined) {
    await switchOrganization(
      {
        organizations,
        memberships: pgMembershipRepository(pool),
        sessions: pgSessionRepository(pool),
        users: pgUserRepository(pool),
      },
      context.actor,
      context.session.id,
      { organizationId: first.id },
    );
    redirect("/dashboard");
  }

  return (
    <main className="auth-shell">
      <div className="auth-top">
        <ThemeToggle />
      </div>
      <section className="auth-card">
        <span className="brand brand-logo" style={{ marginBottom: "1rem" }}>
          <BrandLogo />
        </span>
        <span className="eyebrow">Accès en attente</span>
        <h1>Aucune organisation</h1>
        <p className="hint" style={{ marginBottom: "1.5rem" }}>
          Votre compte n&apos;est rattaché à aucune organisation active. Contactez un administrateur
          pour obtenir un accès.
        </p>
        <LogoutButton />
      </section>
    </main>
  );
}
