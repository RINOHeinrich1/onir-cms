import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listOrganizations } from "@/application/use-cases/organizations/list-organizations";
import type { MemberDto } from "@/application/use-cases/organizations/manage-members";
import { listMembers } from "@/application/use-cases/organizations/manage-members";
import { OrganizationsTable } from "@/components/organizations/OrganizationsTable";
import type { Organization } from "@/domain/entities/organization";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgSessionRepository } from "@/infrastructure/db/session-repository";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Organisations",
};

type OrganizationWithMembers = Organization & { members: MemberDto[] };

/**
 * ADR-0025 §5/§7 — page Organisations.
 * Super-admin : toutes les organisations, création, suspension, membres.
 * Admin d'organisation : uniquement sa/ses organisation(s).
 */
export default async function OrganisationsPage() {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "organizations:list")) {
    redirect("/dashboard");
  }

  const pool = getPool();
  const organizations = pgOrganizationRepository(pool);
  const list = await listOrganizations({ organizations }, context.actor);

  const memberDeps = {
    organizations,
    memberships: pgMembershipRepository(pool),
    users: pgUserRepository(pool),
    sessions: pgSessionRepository(pool),
  };

  const withMembers: OrganizationWithMembers[] = [];
  for (const organization of list) {
    // Un admin d'organisation ne peut voir que les membres de son organisation.
    if (context.actor.isSuperAdmin || context.actor.organizationId === organization.id) {
      withMembers.push({
        ...organization,
        members: await listMembers(memberDeps, context.actor, organization.id),
      });
    } else {
      withMembers.push({ ...organization, members: [] });
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Administration</span>
          <h1 className="text-title">Organisations</h1>
          <p className="muted-text">
            {context.actor.isSuperAdmin
              ? "Plateforme : créez, suspendez et rattachez les utilisateurs."
              : "Gérez les membres de votre organisation."}
          </p>
        </div>
      </div>
      {withMembers.length === 0 ? (
        <p className="hint">
          Aucune organisation ne vous est rattachée. Contactez le super-administrateur de la
          plateforme.
        </p>
      ) : null}
      <OrganizationsTable
        initialOrganizations={withMembers}
        isSuperAdmin={context.actor.isSuperAdmin}
        activeOrganizationId={context.actor.organizationId}
      />
    </section>
  );
}
