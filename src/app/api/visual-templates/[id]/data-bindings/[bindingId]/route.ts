import { NextResponse } from "next/server";
import { ForbiddenError, UnprocessableError, ValidationError } from "@/application/errors";
import type { TemplateDataBinding } from "@/domain/template-data";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateDataBindingRepository } from "@/infrastructure/db/template-data-binding-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { errorResponse } from "../../../../_lib/errors";
import { readJsonObject, stringField } from "../../../../_lib/http";
import { requireRole } from "../../../../_lib/require-user";
import { parseBindingFields } from "../_lib/parse-binding";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; bindingId: string }> };

/** PUT — met à jour un binding (défaut ou variante) par identifiant. */
export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:create");
    if (actor.organizationId === null) throw new ForbiddenError("Aucune organisation active");
    const { id, bindingId } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) throw new ValidationError("Requête invalide");
    const versionName = stringField(body, "version");
    if (versionName === undefined) throw new ValidationError("version requise");

    const version = await pgVisualTemplateRepository(getPool()).findVersion(id, versionName);
    if (version === null) throw new ValidationError("Version inconnue");
    const repo = pgTemplateDataBindingRepository(getPool());
    const existing = await repo.findById(actor.organizationId, bindingId);
    if (existing === null) throw new ValidationError("Binding introuvable");
    if (existing.templateVersionId !== version.id)
      throw new ValidationError("Binding d'une autre version");
    const contract = (version.manifest.dataContracts ?? []).find(
      (entry) => entry.key === existing.contractKey,
    );
    if (contract === undefined) throw new ValidationError("Contrat non déclaré par cette version");

    const fields = parseBindingFields(
      body,
      contract,
      new Set((version.manifest.params ?? []).map((param) => param.key)),
    );
    let binding: TemplateDataBinding | null;
    try {
      binding = await repo.updateById(actor.organizationId, bindingId, {
        ...fields,
        organizationId: actor.organizationId,
        actorId: actor.id,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ValidationError("Ce nom de source est déjà utilisé pour ce contrat");
      }
      throw error;
    }
    if (binding === null) throw new ValidationError("Binding introuvable");
    return NextResponse.json({ binding });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE — supprime une source ; si c'était le défaut, une autre est promue. */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:create");
    if (actor.organizationId === null) throw new ForbiddenError("Aucune organisation active");
    const { bindingId } = await context.params;
    const repo = pgTemplateDataBindingRepository(getPool());
    const binding = await repo.findById(actor.organizationId, bindingId);
    if (binding === null) throw new ValidationError("Binding introuvable");
    const usages = await repo.countLinkUsages(bindingId);
    if (usages > 0) {
      throw new UnprocessableError(`Source utilisée par ${usages} lien(s) : détachez-la d'abord`);
    }
    const result = await repo.deleteWithPromotion(actor.organizationId, bindingId);
    if (!result.deleted) throw new ValidationError("Binding introuvable");
    return NextResponse.json({ ok: true, promotedId: result.promotedId });
  } catch (error) {
    return errorResponse(error);
  }
}
