import { NextResponse } from "next/server";
import {
  deletePlatformOffer,
  updatePlatformOffer,
} from "@/application/use-cases/organizations/manage-platform-offers";
import { pgAiGrantRepository } from "@/infrastructure/db/ai-grant-repository";
import { pgPlatformOfferRepository } from "@/infrastructure/db/platform-offer-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireSuperAdmin } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function deps() {
  const pool = getPool();
  return {
    offers: pgPlatformOfferRepository(pool),
    grants: pgAiGrantRepository(pool),
  };
}

/** PATCH /api/platform/offers/[id] — modification (super-admin). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const offer = await updatePlatformOffer(deps(), actor, id, body);
    return NextResponse.json({ offer });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/platform/offers/[id] — suppression (super-admin). */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await context.params;
    await deletePlatformOffer(deps(), actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
