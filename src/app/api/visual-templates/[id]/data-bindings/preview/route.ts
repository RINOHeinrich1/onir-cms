import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ForbiddenError, ValidationError } from "@/application/errors";
import { TemplateQueryError } from "@/application/ports/template-query-executor";
import { loadTemplateData } from "@/application/use-cases/visual-templates/load-template-data";
import type { ChatLink } from "@/domain/entities/chat";
import type { TemplateSpec } from "@/domain/template-contract";
import type { TemplateDataBinding } from "@/domain/template-data";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateDataBindingRepository } from "@/infrastructure/db/template-data-binding-repository";
import { getTemplateDataExecutor } from "@/infrastructure/db/template-data-runtime";
import type { TemplateQueryExecutorHandle } from "@/infrastructure/db/template-query-executor";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { errorResponse } from "../../../../_lib/errors";
import { readJsonObject, stringField } from "../../../../_lib/http";
import { requireRole } from "../../../../_lib/require-user";
import { parseBindingFields } from "../_lib/parse-binding";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function previewLink(organizationId: string): ChatLink {
  return {
    id: randomUUID(),
    organizationId,
    label: "Aperçu",
    type: "standard",
    surface: "page",
    identificationMode: "contact",
    prospectId: null,
    createdBy: null,
    actif: true,
    expiresAt: null,
    templateKey: "",
    templateVersion: 1,
    sources: { connaissances: true, phototheque: true, lien: true },
    confidentialiteId: null,
    userStateEnabled: false,
    visualTemplateId: null,
    visualTemplateVersion: null,
    visualTemplateConfig: {},
    visualTemplateParams: {},
    widgetConfig: {},
    aiProviderId: null,
    aiModel: null,
    visitCount: 0,
    lastVisitAt: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * POST — aperçu d'un binding enregistré : exécute la requête et valide la sortie
 * contre le contrat, sans cache ni activation. Utile avant d'activer la source.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:create");
    if (actor.organizationId === null) throw new ForbiddenError("Aucune organisation active");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) throw new ValidationError("Requête invalide");
    const versionName = stringField(body, "version");
    const contractKey = stringField(body, "contractKey");
    if (versionName === undefined || contractKey === undefined) {
      throw new ValidationError("version et contractKey requis");
    }
    if (
      body.inputs !== undefined &&
      (typeof body.inputs !== "object" || body.inputs === null || Array.isArray(body.inputs))
    ) {
      throw new ValidationError("inputs : objet attendu");
    }

    const version = await pgVisualTemplateRepository(getPool()).findVersion(id, versionName);
    if (version === null) throw new ValidationError("Version inconnue");

    const rawDraft = body.draft;
    const bindingId = stringField(body, "bindingId");
    let binding: TemplateDataBinding | undefined;
    if (rawDraft !== undefined) {
      if (typeof rawDraft !== "object" || rawDraft === null || Array.isArray(rawDraft)) {
        throw new ValidationError("draft : objet attendu");
      }
      const contract = (version.manifest.dataContracts ?? []).find(
        (entry) => entry.key === contractKey,
      );
      if (contract === undefined) throw new ValidationError("Contrat inconnu");
      const fields = parseBindingFields(
        rawDraft as Record<string, unknown>,
        contract,
        new Set((version.manifest.params ?? []).map((param) => param.key)),
      );
      binding = {
        id: "preview",
        isDefault: false,
        organizationId: actor.organizationId,
        templateVersionId: version.id,
        contractKey,
        provider: "sql",
        revision: 0,
        ...fields,
      };
    } else if (bindingId !== undefined) {
      const found = await pgTemplateDataBindingRepository(getPool()).findById(
        actor.organizationId,
        bindingId,
      );
      if (
        found === null ||
        found.templateVersionId !== version.id ||
        found.contractKey !== contractKey
      ) {
        throw new ValidationError("Binding introuvable pour ce contrat");
      }
      binding = found;
    }

    const spec: TemplateSpec = {
      id,
      versionId: version.id,
      version: version.version,
      mode: version.mode,
      entryUrl: "",
      element: version.manifest.ui.element,
      capabilities: version.manifest.capabilities,
      params: version.manifest.params ?? [],
      dataContracts: version.manifest.dataContracts ?? [],
    };

    let executor: TemplateQueryExecutorHandle;
    try {
      executor = await getTemplateDataExecutor(getPool());
    } catch (error) {
      const message =
        error instanceof TemplateQueryError ? error.message : "Fournisseur indisponible";
      return NextResponse.json(
        { status: "error", code: "DATA_PROVIDER_ERROR", message },
        { status: 200 },
      );
    }

    const result = await loadTemplateData(
      {
        bindings: pgTemplateDataBindingRepository(getPool()),
        executor,
      },
      {
        link: previewLink(actor.organizationId),
        spec,
        contractKey,
        inputs: body.inputs,
        preview: true,
        skipAudit: true,
        ...(binding === undefined ? {} : { binding }),
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
