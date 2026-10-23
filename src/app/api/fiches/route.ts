import { NextResponse } from "next/server";
import { createFiche, listFiches } from "@/application/use-cases/fiche/manage-fiches";
import { parseFicheArchiveFilter } from "@/domain/entities/fiche";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../_lib/errors";
import { readJsonObject } from "../_lib/http";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/fiches — liste (US-FICHE-001, lecture tous rôles). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "project:read");
    const params = new URL(request.url).searchParams;
    const filtre = parseFicheArchiveFilter(params.get("filtre"));
    const lien = params.has("lien") ? (params.get("lien") ?? "") : null;
    const fiches = await listFiches({ fiches: pgFicheRepository(getPool()) }, actor, filtre, lien);
    return NextResponse.json({ fiches });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/fiches — création (admin/marketeur). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "project:write");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const pool = getPool();
    // Le formulaire manuel poste des champs plats (fiche-projet) : ils
    // constituent directement `data`. Un appel structuré peut passer `data`.
    const input =
      body.data !== undefined &&
      body.data !== null &&
      typeof body.data === "object" &&
      !Array.isArray(body.data)
        ? body
        : { ...body, data: body };
    const fiche = await createFiche(
      { fiches: pgFicheRepository(pool), templates: pgChatTemplateRepository(pool) },
      actor,
      input,
    );
    return NextResponse.json({ fiche }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
