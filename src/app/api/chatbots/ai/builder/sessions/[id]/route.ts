import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { requireRole } from "@/app/api/_lib/require-user";
import {
  deleteChatbotBuildSession,
  getChatbotBuildSession,
} from "@/application/use-cases/chatbot-builder/manage-chatbot-builder";
import { getPool } from "@/infrastructure/db/pool";
import { chatbotBuilderDependencies } from "../../deps";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/chatbots/ai/builder/sessions/[id] — reprise d'une session. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:create");
    const { id } = await context.params;
    const stored = await getChatbotBuildSession(chatbotBuilderDependencies(getPool()), actor, id);
    return NextResponse.json(stored);
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/chatbots/ai/builder/sessions/[id] — abandonne une session. */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:create");
    const { id } = await context.params;
    await deleteChatbotBuildSession(chatbotBuilderDependencies(getPool()), actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
