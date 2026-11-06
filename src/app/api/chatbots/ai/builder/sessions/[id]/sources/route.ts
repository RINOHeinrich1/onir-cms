import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { updateChatbotBuildSources } from "@/application/use-cases/chatbot-builder/manage-chatbot-builder";
import { getPool } from "@/infrastructure/db/pool";
import { chatbotBuilderDependencies } from "../../../deps";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/chatbots/ai/builder/sessions/[id]/sources — métadonnées de sources. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const { id } = await context.params;
    const stored = await updateChatbotBuildSources(
      chatbotBuilderDependencies(getPool()),
      actor,
      id,
      body,
    );
    return NextResponse.json(stored);
  } catch (error) {
    return errorResponse(error);
  }
}
