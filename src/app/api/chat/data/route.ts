import { NextResponse } from "next/server";
import { TemplateQueryError } from "@/application/ports/template-query-executor";
import { loadTemplateSpec } from "@/application/use-cases/visual-templates/link-template";
import {
  loadTemplateData,
  type TemplateDataDependencies,
} from "@/application/use-cases/visual-templates/load-template-data";
import { channelsForLink, isChatLinkSurface } from "@/domain/entities/chat";
import { hashLinkToken } from "@/domain/link-token";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { templateDataDependencies } from "@/infrastructure/db/template-data-runtime";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { templateDataLimiter } from "@/lib/chat-limiters";
import { errorResponse } from "../../_lib/errors";
import { clientIp, readJsonObject, stringField } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/data — chargement public d'une ressource de données de template
 * (ADR-0026). Le template fournit le jeton du lien et la clé du contrat ; l'hôte
 * résout le binding, exécute la requête et valide la sortie. Aucun SQL côté
 * client, aucun paramètre de requête fourni par le visiteur.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const token = stringField(body, "token");
    const contract = stringField(body, "contract");
    const surface = stringField(body, "surface");
    if (token === undefined || contract === undefined) {
      return NextResponse.json({ error: "Lien ou ressource manquant" }, { status: 400 });
    }
    if (contract.length > 41) {
      return NextResponse.json(
        { status: "error", code: "DATA_UNBOUND", message: "Ressource inconnue" },
        { status: 200 },
      );
    }
    if (
      body.inputs !== undefined &&
      (typeof body.inputs !== "object" || body.inputs === null || Array.isArray(body.inputs))
    ) {
      return NextResponse.json(
        { status: "error", code: "DATA_INPUT_INVALID", message: "Entrées invalides" },
        { status: 200 },
      );
    }

    const limit = templateDataLimiter(`${clientIp(request)}:${token}`);
    if (limit.limited) {
      return NextResponse.json(
        { error: "Trop de requêtes, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const pool = getPool();
    const link = await pgChatLinkRepository(pool).findByTokenHash(hashLinkToken(token.trim()));
    if (link === null || !link.actif) {
      return NextResponse.json(
        { status: "error", code: "DATA_UNAUTHORIZED", message: "Lien introuvable" },
        { status: 404 },
      );
    }
    const organization = await pgOrganizationRepository(pool).findById(link.organizationId);
    if (organization === null || organization.suspendedAt !== null) {
      return NextResponse.json(
        { status: "error", code: "DATA_UNAUTHORIZED", message: "Lien indisponible" },
        { status: 404 },
      );
    }
    if (link.expiresAt !== null && new Date(link.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json(
        { status: "error", code: "DATA_UNAUTHORIZED", message: "Lien expiré" },
        { status: 410 },
      );
    }

    const channelKind =
      surface !== undefined && isChatLinkSurface(surface) ? surface : link.surface;
    const channel = channelsForLink(link)[channelKind];
    if (!channel.enabled) {
      return NextResponse.json(
        { status: "error", code: "DATA_UNAUTHORIZED", message: "Canal de diffusion désactivé" },
        { status: 404 },
      );
    }
    const spec = await loadTemplateSpec(
      {
        visualTemplates: pgVisualTemplateRepository(pool),
        medias: pgMediaRepository(pool),
        templates: pgChatTemplateRepository(pool),
      },
      link,
      channelKind,
      channel,
    );
    if (spec === null) {
      return NextResponse.json(
        { status: "error", code: "DATA_UNBOUND", message: "Aucun template visuel rattaché" },
        { status: 200 },
      );
    }

    let deps: TemplateDataDependencies;
    try {
      deps = await templateDataDependencies(pool);
    } catch (error) {
      const message =
        error instanceof TemplateQueryError ? error.message : "Fournisseur de données indisponible";
      return NextResponse.json(
        { status: "error", code: "DATA_PROVIDER_ERROR", message },
        { status: 200 },
      );
    }

    const result = await loadTemplateData(deps, {
      link,
      spec,
      contractKey: contract,
      inputs: body.inputs,
      params: channel.visualTemplateParams,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
