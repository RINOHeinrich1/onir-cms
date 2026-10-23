import { NextResponse } from "next/server";
import { createAiProvider, listAiProviders } from "@/application/use-cases/ai/manage-ai-providers";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/ai/providers — fournisseurs de l'organisation active. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:list");
    const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "1";
    const providers = await listAiProviders(
      { providers: pgAiProviderRepository(getPool()) },
      actor,
      { includeArchived },
    );
    return NextResponse.json({ providers });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/ai/providers — création (admin). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const provider = await createAiProvider(
      { providers: pgAiProviderRepository(getPool()) },
      actor,
      body,
    );
    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
