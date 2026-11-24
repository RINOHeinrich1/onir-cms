import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import { getPool } from "@/infrastructure/db/pool";
import { pgStandaloneRepository } from "@/infrastructure/db/standalone-repository";
import { standaloneBuildStorage } from "@/infrastructure/storage";
import { errorResponse } from "../../../../../../_lib/errors";
import { requireRole } from "../../../../../../_lib/require-user";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string; buildId: string }> };

/** GET /api/links/[id]/standalone/builds/[buildId]/download */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const actor = await requireRole(request, "links:update");
    if (actor.organizationId === null) throw new ValidationError("Organisation requise");
    const { id, buildId } = await context.params;
    const build = await pgStandaloneRepository(getPool()).findBuild(buildId);
    if (
      build === null ||
      build.chatLinkId !== id ||
      build.organizationId !== actor.organizationId
    ) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    if (build.status !== "ready" && build.status !== "active") {
      throw new ValidationError("Le build n'est pas encore téléchargeable");
    }
    if (build.artifactKey === null) throw new ValidationError("Artefact introuvable");
    const archive = await standaloneBuildStorage().get(`${build.artifactKey}/site.zip`);
    if (archive === null)
      return NextResponse.json({ error: "Archive introuvable" }, { status: 404 });
    return new NextResponse(new Uint8Array(archive.data), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="standalone-${build.buildNumber}.zip"`,
        "Cache-Control": "private, no-store",
        "Content-Length": String(archive.data.byteLength),
      },
    });
  } catch (error) {
    return errorResponse(error) as Response;
  }
}
