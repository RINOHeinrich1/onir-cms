import { NextResponse } from "next/server";
import { deleteTemplateParamAsset } from "@/application/use-cases/template-params/manage-template-param-assets";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateParamAssetRepository } from "@/infrastructure/db/template-param-asset-repository";
import { mediaStorage } from "@/infrastructure/storage";
import { errorResponse } from "../../_lib/errors";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const asset = await pgTemplateParamAssetRepository(getPool()).findByIdPublic(id);
    if (asset === null) return NextResponse.json({ error: "Asset introuvable" }, { status: 404 });
    const file = await mediaStorage(asset.organizationId).read(asset.storageKey);
    if (file === null) return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": asset.mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    await deleteTemplateParamAsset(
      {
        assets: pgTemplateParamAssetRepository(getPool()),
        storage: mediaStorage(actor.organizationId ?? undefined),
      },
      actor,
      id,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
