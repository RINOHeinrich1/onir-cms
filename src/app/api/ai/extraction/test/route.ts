import { NextResponse } from "next/server";
import { parseExtractionJson } from "@/application/use-cases/fiche/draft-fiche";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

/** POST /api/ai/extraction/test — test JSON court sur un modèle actif. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    if (actor.organizationId === null) {
      return NextResponse.json({ ok: false, error: "Aucune organisation active" });
    }
    const body = await readJsonObject(request);
    const providerId = body && typeof body.providerId === "string" ? body.providerId : "";
    const model = body && typeof body.model === "string" ? body.model : "";
    if (providerId === "" || model === "") {
      return NextResponse.json(
        { ok: false, error: "Fournisseur et modèle requis" },
        { status: 400 },
      );
    }

    const startedAt = Date.now();
    try {
      const client = await pgAiClientFactory(getPool()).forTarget({
        organizationId: actor.organizationId,
        aiProviderId: providerId,
        aiModel: model,
      });
      const raw = await client.complete({
        system:
          "Extrais les informations. Réponds uniquement avec un objet JSON strict, sans texte autour.",
        messages: [
          {
            role: "user",
            content:
              "Conversation test : le client s'appelle Acme, son budget est 5000 et son besoin est une refonte du site.",
          },
        ],
        maxTokens: 500,
        reasoning: "disabled",
        structured: true,
      });
      const parsed = parseExtractionJson(raw);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({
          ok: false,
          latencyMs: Date.now() - startedAt,
          error: "Le modèle n'a pas renvoyé un objet JSON exploitable.",
        });
      }
      return NextResponse.json({
        ok: true,
        latencyMs: Date.now() - startedAt,
        preview: JSON.stringify(parsed).slice(0, 240),
      });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Extraction impossible",
      });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
