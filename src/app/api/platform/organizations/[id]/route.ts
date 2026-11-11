import { NextResponse } from "next/server";
import { NotFoundError } from "@/application/errors";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { requirePlatformAdmin } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requirePlatformAdmin(request);
    const { id } = await context.params;
    const organization = await pgOrganizationRepository(getPool()).findById(id);
    if (organization === null) throw new NotFoundError("Organisation introuvable");
    return NextResponse.json({ organization });
  } catch (error) {
    return errorResponse(error);
  }
}
