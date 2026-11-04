import { NextResponse } from "next/server";
import {
  createPlatformOffer,
  listPlatformOffers,
} from "@/application/use-cases/organizations/manage-platform-offers";
import { pgAiGrantRepository } from "@/infrastructure/db/ai-grant-repository";
import { pgPlatformOfferRepository } from "@/infrastructure/db/platform-offer-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireSuperAdmin } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

function deps() {
  const pool = getPool();
  return {
    offers: pgPlatformOfferRepository(pool),
    grants: pgAiGrantRepository(pool),
  };
}

/** GET /api/platform/offers — offres réutilisables (super-admin). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "1";
    const offers = await listPlatformOffers(deps(), actor, includeInactive);
    return NextResponse.json({ offers });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/platform/offers — création (super-admin). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const offer = await createPlatformOffer(deps(), actor, body);
    return NextResponse.json({ offer }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
