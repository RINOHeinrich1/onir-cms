import { NextResponse } from "next/server";
import {
  createTemplateParamAsset,
  TEMPLATE_PARAM_IMAGE_MAX_BYTES,
} from "@/application/use-cases/template-params/manage-template-param-assets";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateParamAssetRepository } from "@/infrastructure/db/template-param-asset-repository";
import { mediaStorage } from "@/infrastructure/storage";
import { publicLinkBaseUrl } from "@/lib/env";
import { errorResponse } from "../_lib/errors";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }
    if (file.size > TEMPLATE_PARAM_IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: "Fichier trop volumineux" }, { status: 400 });
    }
    const result = await createTemplateParamAsset(
      {
        assets: pgTemplateParamAssetRepository(getPool()),
        storage: mediaStorage(actor.organizationId ?? undefined),
      },
      actor,
      { data: Buffer.from(await file.arrayBuffer()), contentType: file.type },
    );
    return NextResponse.json(
      {
        url: `${publicLinkBaseUrl().replace(/\/$/, "")}${result.url}`,
        assetId: result.asset.id,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
