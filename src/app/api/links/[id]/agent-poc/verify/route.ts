import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { organizationOf } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import { callStructuredAi } from "@/application/use-cases/chatbots/structured-ai-call";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getPool } from "@/infrastructure/db/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    await context.params;
    const body = await readJsonObject(request);
    if (body === null) throw new ValidationError("Requête invalide");
    const goal = text(body.goal);
    if (goal === "") throw new ValidationError("Objectif requis");
    const observation =
      body.observation !== null && typeof body.observation === "object"
        ? (body.observation as Record<string, unknown>)
        : {};
    const execution =
      body.execution !== null && typeof body.execution === "object"
        ? (body.execution as Record<string, unknown>)
        : {};
    const client = await pgAiClientFactory(getPool()).forTarget(
      {
        organizationId: organizationOf(actor),
        aiProviderId: null,
        aiModel: null,
      },
      "assistant",
    );
    const source = await callStructuredAi(client, {
      system: [
        "Tu vérifies si une observation d’aperçu satisfait l’objectif utilisateur.",
        "Tu réponds uniquement en JSON valide.",
        'Format : {"satisfied":true|false,"reason":"...","missing":"..."}',
        "Ne suppose pas qu’une modification est réussie si le texte ou le lien attendu n’est pas visible.",
        "Les postconditions de l’exécution (execution.verification) font foi pour les objets qui ne sont pas visibles sur la page courante.",
        "Une page créée, son texte et son entrée de menu peuvent donc être validés même si l’aperçu reste sur une autre page.",
      ].join("\n"),
      user: [
        `Objectif : ${goal}`,
        `Observation : ${JSON.stringify(observation).slice(0, 12000)}`,
        `Exécution : ${JSON.stringify(execution).slice(0, 4000)}`,
      ].join("\n\n"),
    });
    return NextResponse.json({
      satisfied: source.satisfied === true,
      reason: text(source.reason),
      missing: text(source.missing),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
