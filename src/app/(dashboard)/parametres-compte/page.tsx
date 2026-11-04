import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listApiKeys } from "@/application/use-cases/api-keys/list-api-keys";
import { listInvitations } from "@/application/use-cases/invitations/list-invitations";
import { listOrganizations } from "@/application/use-cases/organizations/list-organizations";
import type { MemberDto } from "@/application/use-cases/organizations/manage-members";
import { listMembers } from "@/application/use-cases/organizations/manage-members";
import {
  AccountSettings,
  type AccountTab,
  type PeopleTab,
} from "@/components/account/AccountSettings";
import type { InvitationDto } from "@/components/invitations/InvitationsManager";
import { invitationStatus } from "@/domain/entities/invitation";
import type { Organization } from "@/domain/entities/organization";
import { pgApiKeyRepository } from "@/infrastructure/db/api-key-repository";
import { pgInvitationRepository } from "@/infrastructure/db/invitation-repository";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgSessionRepository } from "@/infrastructure/db/session-repository";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paramètres du compte",
};

type OrganizationWithMembers = Organization & { members: MemberDto[] };

const ACCOUNT_TABS = new Set<AccountTab>([
  "compte",
  "organisation",
  "utilisateurs",
  "acces-api",
  "profils",
]);

function accountTab(value: string | undefined): AccountTab {
  return value !== undefined && ACCOUNT_TABS.has(value as AccountTab)
    ? (value as AccountTab)
    : "compte";
}

function peopleTab(value: string | undefined): PeopleTab {
  return value === "invitations" ? "invitations" : "membres";
}

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sub?: string; organization?: string }>;
}) {
  const context = await getSessionContext();
  if (context === null) redirect("/login");

  const params = await searchParams;
  const canOrganizations = actorCan(context.actor, "organizations:list");
  const canUsers = actorCan(context.actor, "users:list");
  const canInvitations = actorCan(context.actor, "invitations:list");
  const canApiKeys = actorCan(context.actor, "api_keys:list");
  const pool = getPool();
  const organizationsRepository = pgOrganizationRepository(pool);
  const organizations =
    canOrganizations || canUsers
      ? await listOrganizations({ organizations: organizationsRepository }, context.actor)
      : [];

  const memberDeps = {
    organizations: organizationsRepository,
    memberships: pgMembershipRepository(pool),
    users: pgUserRepository(pool),
    sessions: pgSessionRepository(pool),
  };
  const withMembers: OrganizationWithMembers[] = [];
  for (const organization of organizations) {
    if (!canUsers) {
      withMembers.push({ ...organization, members: [] });
      continue;
    }
    if (context.actor.isSuperAdmin || context.actor.organizationId === organization.id) {
      withMembers.push({
        ...organization,
        members: await listMembers(memberDeps, context.actor, organization.id),
      });
    } else {
      withMembers.push({ ...organization, members: [] });
    }
  }

  const invitations: InvitationDto[] = canInvitations
    ? (await listInvitations({ invitations: pgInvitationRepository(pool) }, context.actor)).map(
        (record) => ({
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
        }),
      )
    : [];

  const apiKeys =
    canApiKeys && context.actor.organizationId !== null
      ? await listApiKeys({ apiKeys: pgApiKeyRepository(pool) }, context.actor)
      : [];

  return (
    <AccountSettings
      email={context.user.email}
      role={context.role}
      organizationName={context.organization?.name ?? null}
      activeOrganizationId={context.actor.organizationId}
      isSuperAdmin={context.actor.isSuperAdmin}
      initialTab={accountTab(params.tab)}
      initialPeopleTab={peopleTab(params.sub)}
      initialOrganizationId={params.organization ?? null}
      organizations={withMembers}
      invitations={invitations}
      apiKeys={apiKeys}
      canOrganizations={canOrganizations}
      canUsers={canUsers}
      canInvitations={canInvitations}
      canApiKeys={canApiKeys}
    />
  );
}
