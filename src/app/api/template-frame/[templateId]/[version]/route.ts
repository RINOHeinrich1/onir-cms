import { NextResponse } from "next/server";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { renderIframeFrame } from "@/infrastructure/templates/iframe-frame";
import { errorResponse } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ templateId: string; version: string }> };

/** GET — document iframe contrôlé par l'hôte pour un template iframe. */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse | Response> {
  try {
    const { templateId, version } = await context.params;
    const surface =
      new URL(request.url).searchParams.get("surface") === "widget" ? "widget" : "page";
    const repo = pgVisualTemplateRepository(getPool());
    const template = await repo.findById(templateId);
    if (template === null || template.disabledAt !== null) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    const templateVersion = await repo.findVersion(templateId, version);
    if (templateVersion === null) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    const widget = templateVersion.manifest.ui.widget;
    const entry =
      surface === "widget" && widget !== undefined ? widget.entry : templateVersion.entry;
    const asset = await repo.findAsset(templateVersion.id, entry);
    if (asset === null) {
      return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
    }

    const versionRoot = `/api/template-assets/${template.id}/${templateVersion.version}/`;
    if (asset.mime === "text/html" || entry.toLowerCase().endsWith(".html")) {
      return NextResponse.redirect(new URL(`${versionRoot}${entry}`, request.url), 302);
    }

    const html = renderIframeFrame({
      title: template.name,
      entry,
      integrity:
        surface === "widget" && widget !== undefined ? widget.integrity : templateVersion.integrity,
      element:
        surface === "widget" && widget !== undefined
          ? widget.element
          : templateVersion.manifest.ui.element,
      versionRoot,
    });
    const network = templateVersion.manifest.network.join(" ");
    const connectSources =
      templateVersion.manifest.network.length > 0
        ? templateVersion.manifest.network.join(" ")
        : "'none'";
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": [
          "default-src 'none'",
          `script-src 'self' 'unsafe-inline'${network === "" ? "" : ` ${network}`}`,
          `style-src 'self' 'unsafe-inline'${network === "" ? "" : ` ${network}`}`,
          "img-src 'self' data: blob: https:",
          `font-src 'self' data: https:${network === "" ? "" : ` ${network}`}`,
          `connect-src ${connectSources}`,
          "base-uri 'self'",
          "form-action 'none'",
        ].join("; "),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
