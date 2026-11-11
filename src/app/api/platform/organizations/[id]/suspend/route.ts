import { NextResponse } from "next/server";
import { suspendOrganization } from "@/application/use-cases/organizations/suspend-organization";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../_lib/errors";
import { requirePlatformAdmin } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requirePlatformAdmin(request);
    const { id } = await context.params;
    const organization = await suspendOrganization(
      { organizations: pgOrganizationRepository(getPool()) },
      actor,
      id,
    );
    return NextResponse.json({ organization });
  } catch (error) {
    return errorResponse(error);
  }
}
