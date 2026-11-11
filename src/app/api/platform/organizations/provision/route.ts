import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import { createInvitation } from "@/application/use-cases/invitations/create-invitation";
import { assignLimitProfile } from "@/application/use-cases/organizations/assign-limit-profile";
import { createOrganization } from "@/application/use-cases/organizations/create-organization";
import { pgAiGrantRepository } from "@/infrastructure/db/ai-grant-repository";
import { pgInvitationRepository } from "@/infrastructure/db/invitation-repository";
import { pgLimitProfileRepository } from "@/infrastructure/db/limit-profile-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { pgPlatformProvisioningRepository } from "@/infrastructure/db/platform-provisioning-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { appUrl } from "@/lib/env";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject, stringField } from "../../../_lib/http";
import { requirePlatformAdmin } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

function required(body: Record<string, unknown>, key: string): string {
  const value = stringField(body, key)?.trim() ?? "";
  if (value === "") throw new ValidationError(`Champ requis: ${key}`);
  return value;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requirePlatformAdmin(request);
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

    const externalRequestId = required(body, "externalRequestId");
    const organizationName = required(body, "organizationName");
    const ownerName = required(body, "ownerName");
    const ownerEmail = required(body, "ownerEmail");
    const limitProfileId = required(body, "limitProfileId");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      return NextResponse.json({ error: "Email administrateur invalide" }, { status: 400 });
    }

    const pool = getPool();
    const provisioning = pgPlatformProvisioningRepository(pool);
    const existing = await provisioning.find(externalRequestId);
    if (existing?.response !== null && existing?.response !== undefined) {
      return NextResponse.json(existing.response);
    }

    const organizations = pgOrganizationRepository(pool);
    const profiles = pgLimitProfileRepository(pool);
    const organization = await createOrganization(
      { organizations, users: pgUserRepository(pool) },
      actor,
      { name: organizationName },
    );
    await assignLimitProfile({ profiles, organizations }, actor, organization.id, {
      profileId: limitProfileId,
    });

    const invitation = await createInvitation(
      {
        invitations: pgInvitationRepository(pool),
        organizations,
        grants: pgAiGrantRepository(pool),
        profiles,
      },
      actor,
      { organizationId: organization.id, role: "admin" },
    );

    const response = {
      organizationId: organization.id,
      ownerUserId: null,
      invitationSent: true,
      limitProfileId,
      invitationUrl: `${appUrl()}/invitation/${invitation.token}`,
      ownerEmail,
      ownerName,
    };
    await provisioning.save({ externalRequestId, organizationId: organization.id, response });
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
