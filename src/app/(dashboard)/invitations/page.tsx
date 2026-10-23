import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listInvitations } from "@/application/use-cases/invitations/list-invitations";
import { listOrganizations } from "@/application/use-cases/organizations/list-organizations";
import {
  type InvitationDto,
  InvitationsManager,
} from "@/components/invitations/InvitationsManager";
import { invitationStatus } from "@/domain/entities/invitation";
import { pgInvitationRepository } from "@/infrastructure/db/invitation-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invitations",
};

/** Page d'administration des invitations (admin d'organisation / super-admin). */
export default async function InvitationsPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "invitations:list")) redirect("/");

  const pool = getPool();
  const records = await listInvitations(
    { invitations: pgInvitationRepository(pool) },
    context.actor,
  );
  const organizations = await listOrganizations(
    { organizations: pgOrganizationRepository(pool) },
    context.actor,
  );

  const invitations: InvitationDto[] = records.map((record) => ({
    id: record.id,
    organizationId: record.organizationId,
    organizationName: record.organizationName,
    role: record.role,
    invitedByEmail: record.invitedByEmail,
    expiresAt: record.expiresAt,
    acceptedAt: record.acceptedAt,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
    url: record.token === null ? null : `${appUrl()}/invitation/${record.token}`,
    status: invitationStatus(record),
  }));

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Administration</span>
          <h1 className="text-title">Invitations</h1>
          <p className="muted-text">
            Créez un lien à usage unique, valable 7 jours, puis transmettez-le à la personne
            concernée. Le lien peut être révoqué à tout moment.
          </p>
        </div>
      </div>
      <InvitationsManager
        initialInvitations={invitations}
        organizations={organizations.map((organization) => ({
          id: organization.id,
          name: organization.name,
        }))}
        isSuperAdmin={context.actor.isSuperAdmin}
        activeOrganizationId={context.actor.organizationId}
      />
    </section>
  );
}
