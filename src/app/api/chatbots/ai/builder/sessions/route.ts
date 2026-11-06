import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { requireRole } from "@/app/api/_lib/require-user";
import { startChatbotBuildSession } from "@/application/use-cases/chatbot-builder/manage-chatbot-builder";
import { getPool } from "@/infrastructure/db/pool";
import { chatbotBuilderDependencies } from "../deps";

export const dynamic = "force-dynamic";

/** POST /api/chatbots/ai/builder/sessions — démarre une session conversationnelle. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:create");
    const stored = await startChatbotBuildSession(chatbotBuilderDependencies(getPool()), actor);
    return NextResponse.json(stored, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
