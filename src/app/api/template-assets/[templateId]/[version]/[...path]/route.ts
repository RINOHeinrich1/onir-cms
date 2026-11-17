import { NextResponse } from "next/server";
import { resolveVisualTemplateAsset } from "@/application/use-cases/visual-templates/manage-visual-templates";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { mediaStorage } from "@/infrastructure/storage";
import { errorResponse } from "../../../../_lib/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ templateId: string; version: string; path: string[] }> };

/**
 * GET /api/template-assets/[templateId]/[version]/[...path] — sert un asset d'un
 * template visuel (PUBLIC : chargé par le navigateur du visiteur). Lecture seule,
 * immuable, type MIME depuis la base.
 */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const { templateId, version, path } = await context.params;
    const joined = Array.isArray(path) ? path.join("/") : String(path ?? "");
    const asset = await resolveVisualTemplateAsset(
      {
        templates: pgVisualTemplateRepository(getPool()),
        storage: mediaStorage(),
      },
      { templateId, version, path: joined },
    );
    if (asset === null) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    const connectSources = asset.network.length > 0 ? asset.network.join(" ") : "'none'";
    return new Response(new Uint8Array(asset.data), {
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": [
          "sandbox allow-scripts allow-forms",
          "default-src 'none'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https:",
          "font-src 'self' data:",
          `connect-src ${connectSources}`,
        ].join("; "),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
