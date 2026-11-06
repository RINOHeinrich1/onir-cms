import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { continueChatbotBuildSession } from "@/application/use-cases/chatbot-builder/manage-chatbot-builder";
import { getPool } from "@/infrastructure/db/pool";
import { chatbotBuilderLimiter } from "@/lib/rate-limit";
import { chatbotBuilderDependencies } from "../../../deps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/chatbots/ai/builder/sessions/[id]/messages — un tour de cadrage. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:create");
    const limited = chatbotBuilderLimiter(`chatbot-builder:${actor.id}`);
    if (limited.limited) {
      return NextResponse.json(
        { error: "Trop de messages IA, réessayez dans un instant" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const { id } = await context.params;
    const stored = await continueChatbotBuildSession(
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
