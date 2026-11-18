import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import { createInvitation } from "@/application/use-cases/invitations/create-invitation";
import { assignLimitProfile } from "@/application/use-cases/organizations/assign-limit-profile";
import { createOrganization } from "@/application/use-cases/organizations/create-organization";
import { pgAiGrantRepository } from "@/infrastructure/db/ai-grant-repository";
import { pgInvitationRepository } from "@/infrastructure/db/invitation-repository";
import { pgLimitProfileRepository } from "@/infrastructure/db/limit-profile-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { appUrl } from "@/lib/env";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requirePlatformSuperAdmin } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

function requiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${key} requis`);
  }
  return value.trim();
}

/** POST /api/platform/organizations/provision — provisioning serveur-à-serveur (ADR-0008). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requirePlatformSuperAdmin(request);
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

    const organizationName = requiredString(body, "organizationName");
    const ownerEmail = requiredString(body, "ownerEmail");
    const limitProfileId = requiredString(body, "limitProfileId");
    const externalRequestId = requiredString(body, "externalRequestId");

    const pool = getPool();
    const organizations = pgOrganizationRepository(pool);
    const users = pgUserRepository(pool);
    const profiles = pgLimitProfileRepository(pool);
    const invitations = pgInvitationRepository(pool);
    const grants = pgAiGrantRepository(pool);

    let organization = await organizations.findByName(organizationName);
    if (organization === null) {
      organization = await createOrganization({ organizations, users }, actor, {
        name: organizationName,
      });
    }

    await assignLimitProfile({ profiles, organizations }, actor, organization.id, {
      profileId: limitProfileId,
    });

    const invitation = await createInvitation(
      { invitations, organizations, profiles, grants },
      actor,
      { organizationId: organization.id, role: "admin" },
    );

    return NextResponse.json({
      organizationId: organization.id,
      ownerUserId: null,
      invitationSent: false,
      limitProfileId,
      invitationUrl: `${appUrl()}/invitation/${invitation.token}`,
      externalRequestId,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
