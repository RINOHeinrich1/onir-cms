import { NextResponse } from "next/server";
import { organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import {
  archiveAiProvider,
  updateAiProvider,
} from "@/application/use-cases/ai/manage-ai-providers";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/ai/providers/[id] — détail sans clé API. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:read");
    const { id } = await context.params;
    const provider = await pgAiProviderRepository(getPool()).findById(organizationOf(actor), id);
    if (provider === null) throw new NotFoundError("Fournisseur introuvable");
    return NextResponse.json({ provider });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/ai/providers/[id] — édition (admin). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const provider = await updateAiProvider(
      { providers: pgAiProviderRepository(getPool()) },
      actor,
      id,
      body,
    );
    return NextResponse.json({ provider });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/ai/providers/[id] — archivage (jamais de suppression physique). */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { id } = await context.params;
    const provider = await archiveAiProvider(
      { providers: pgAiProviderRepository(getPool()) },
      actor,
      id,
    );
    return NextResponse.json({ provider });
  } catch (error) {
    return errorResponse(error);
  }
}
