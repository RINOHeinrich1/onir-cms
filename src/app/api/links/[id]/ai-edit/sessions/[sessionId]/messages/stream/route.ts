import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { continueTemplateEditSession } from "@/application/use-cases/visual-templates/template-edit-session";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateEditAuditRepository } from "@/infrastructure/db/template-edit-audit-repository";
import { pgTemplateEditSessionRepository } from "@/infrastructure/db/template-edit-session-repository";
import {
  loadTemplateEditContext,
  paramsFrom,
  surfaceFrom,
  templateSkillLoaderFor,
} from "../../../../context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

/** POST /api/links/[id]/ai-edit/sessions/[sessionId]/messages/stream */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id, sessionId } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const pool = getPool();
    const loaded = await loadTemplateEditContext(pool, actor, id, surfaceFrom(body.surface));
    const workingParams = paramsFrom(body.params, loaded.workingParams, loaded);
    const encoder = new TextEncoder();
    let sequence = 0;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown): void => {
          if (closed) return;
          sequence += 1;
          controller.enqueue(
            encoder.encode(`id: ${sequence}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        void (async () => {
          try {
            const session = await continueTemplateEditSession(
              {
                sessions: pgTemplateEditSessionRepository(pool),
                aiFactory: pgAiClientFactory(pool),
                audit: pgTemplateEditAuditRepository(pool),
                skillLoader: templateSkillLoaderFor(pool),
              },
              actor,
              { ...loaded, workingParams },
              sessionId,
              { message: body.message, selection: body.selection, params: workingParams },
              (event) => send("step", event),
            );
            send("session", session);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Erreur d’édition";
            send("error", { message });
          } finally {
            closed = true;
            controller.close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
