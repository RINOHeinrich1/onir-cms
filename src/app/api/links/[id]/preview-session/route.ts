import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import { savePreviewSession } from "@/application/use-cases/links/manage-preview-session";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgPreviewSessionRepository } from "@/infrastructure/db/preview-session-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/links/[id]/preview-session — crée ou met à jour l’état d’aperçu. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError("Corps JSON invalide");
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("Objet attendu");
    }
    const input = body as {
      token?: unknown;
      surface?: unknown;
      template?: unknown;
      params?: unknown;
    };
    if (input.surface !== "page" && input.surface !== "widget") {
      throw new ValidationError("Surface invalide");
    }
    if (input.token !== undefined && input.token !== null && typeof input.token !== "string") {
      throw new ValidationError("Token invalide");
    }
    if (
      input.template !== undefined &&
      input.template !== null &&
      typeof input.template !== "string"
    ) {
      throw new ValidationError("Template invalide");
    }
    const pool = getPool();
    const result = await savePreviewSession(
      {
        links: pgChatLinkRepository(pool),
        templates: pgVisualTemplateRepository(pool),
        previews: pgPreviewSessionRepository(pool),
      },
      actor,
      id,
      {
        token: typeof input.token === "string" ? input.token : null,
        surface: input.surface,
        template: typeof input.template === "string" ? input.template : null,
        params: input.params,
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
