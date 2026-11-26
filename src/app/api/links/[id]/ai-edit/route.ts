import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { ValidationError } from "@/application/errors";
import { generateTemplateEditProposal } from "@/application/use-cases/visual-templates/generate-template-edit-proposal";
import { rankTemplateEditCandidates } from "@/application/use-cases/visual-templates/rank-template-edit-candidates";
import {
  listTemplateEditCandidates,
  resolveTemplateEditTarget,
} from "@/domain/template-edit-resolver";
import type { TemplateEditCandidate } from "@/domain/template-edit-target";
import {
  validateTemplateEditorCollectionValues,
  validateTemplateEditorStructureValues,
} from "@/domain/template-editor";
import {
  normalizeTemplateParamValuesStrict,
  type TemplateParamValues,
  validateTemplateParamValues,
} from "@/domain/template-params";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateAuditRepository } from "@/infrastructure/db/visual-template-audit-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { templateEditLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function selection(value: unknown): { regionId: string } | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const regionId = text((value as Record<string, unknown>).regionId);
  return regionId === "" ? null : { regionId };
}

function parseParams(raw: unknown, fallback: TemplateParamValues): TemplateParamValues {
  if (raw === undefined) return fallback;
  const normalized = normalizeTemplateParamValuesStrict(raw);
  if (!normalized.ok) {
    throw new ValidationError(
      normalized.errors.map((error) => `${error.field} — ${error.message}`).join(" ; "),
    );
  }
  return normalized.value;
}

/** POST /api/links/[id]/ai-edit — propose une édition, sans écriture. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const limited = templateEditLimiter(`template-edit:${actor.id}`);
    if (limited.limited) {
      return NextResponse.json(
        { error: "Trop de demandes d’édition IA, réessayez dans un instant" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const prompt = text(body.request).slice(0, 2_000);
    if (prompt === "") return NextResponse.json({ error: "Demande requise" }, { status: 400 });

    const organizationId = actor.organizationId;
    if (organizationId === null)
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    const pool = getPool();
    const links = pgChatLinkRepository(pool);
    const link = await links.findById(organizationId, id);
    if (link === null) return NextResponse.json({ error: "Lien introuvable" }, { status: 404 });
    if (link.visualTemplateId === null || link.visualTemplateVersion === null) {
      return NextResponse.json(
        { error: "Aucun template visuel rattaché à ce lien" },
        { status: 400 },
      );
    }
    const visualTemplates = pgVisualTemplateRepository(pool);
    const version = await visualTemplates.findVersion(
      link.visualTemplateId,
      link.visualTemplateVersion,
    );
    if (version === null) {
      return NextResponse.json({ error: "Version de template introuvable" }, { status: 404 });
    }

    const values = parseParams(body.params, link.visualTemplateParams);
    const paramErrors = validateTemplateParamValues(version.manifest.params, values);
    if (version.manifest.editor !== undefined) {
      paramErrors.push(
        ...validateTemplateEditorCollectionValues(version.manifest.editor, values),
        ...validateTemplateEditorStructureValues(version.manifest.editor, values),
      );
    }
    if (paramErrors.length > 0) {
      throw new ValidationError(
        paramErrors.map((error) => `${error.field} — ${error.message}`).join(" ; "),
      );
    }

    const resolved = resolveTemplateEditTarget({
      request: prompt,
      currentPageId: text(body.currentPageId) === "" ? null : text(body.currentPageId),
      selection: selection(body.selection),
      editor: version.manifest.editor ?? { version: 1, regions: [], bindings: [] },
      values,
    });
    const candidates =
      resolved.candidates.length > 0
        ? resolved.candidates
        : listTemplateEditCandidates({
            request: prompt,
            currentPageId: text(body.currentPageId) === "" ? null : text(body.currentPageId),
            selection: selection(body.selection),
            editor: version.manifest.editor ?? { version: 1, regions: [], bindings: [] },
            values,
          });
    if (candidates.length === 0) {
      return NextResponse.json({
        status: "not_found",
        message: "Aucune cible éditable ne correspond à cette demande.",
      });
    }

    const candidateId = text(body.candidateId);
    let candidate: TemplateEditCandidate | null =
      candidateId === ""
        ? null
        : (candidates.find((entry) => `${entry.collection}:${entry.itemId}` === candidateId) ??
          null);
    if (candidateId !== "" && candidate === null) {
      return NextResponse.json({ error: "Cible inconnue" }, { status: 400 });
    }

    if (candidate === null) {
      const decision = await rankTemplateEditCandidates(
        { aiFactory: pgAiClientFactory(pool) },
        actor,
        {
          request: prompt,
          page: resolved.page,
          candidates,
          ...(text(body.providerId) === "" ? {} : { providerId: text(body.providerId) }),
          ...(text(body.model) === "" ? {} : { model: text(body.model) }),
        },
      );
      if (decision.status === "not_found") {
        return NextResponse.json({
          status: "not_found",
          message: "Aucune cible éditable ne correspond à cette demande.",
        });
      }
      if (decision.status === "ambiguous") {
        return NextResponse.json({
          status: "ambiguous",
          question: decision.question,
          candidates: decision.candidates,
        });
      }
      candidate = decision.candidate;
    }

    const generated = await generateTemplateEditProposal(
      { aiFactory: pgAiClientFactory(pool) },
      actor,
      {
        request: prompt,
        page: resolved.page,
        candidate,
        editor: version.manifest.editor ?? { version: 1, regions: [], bindings: [] },
        schema: version.manifest.params,
        values,
        ...(text(body.providerId) === "" ? {} : { providerId: text(body.providerId) }),
        ...(text(body.model) === "" ? {} : { model: text(body.model) }),
      },
    );

    await pgVisualTemplateAuditRepository(pool).record({
      organizationId,
      templateId: link.visualTemplateId,
      actorId: actor.id,
      event: "ai_edit",
      metadata: {
        linkId: link.id,
        request: prompt,
        candidate: `${candidate.collection}:${candidate.itemId}`,
        candidateLabel: candidate.label,
        operations: generated.proposal.operations.length,
        warnings: generated.warnings,
      },
    });

    return NextResponse.json({
      status: "proposed",
      candidate,
      proposal: generated.proposal,
      values: generated.values,
      warnings: generated.warnings,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
