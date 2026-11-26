import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import type { AiClientFactory, ResolvedAiTarget } from "@/application/ports/ai-client-factory";
import { callStructuredAi } from "@/application/use-cases/chatbots/structured-ai-call";
import {
  disambiguateTemplateEdit,
  type TemplateEditConfidence,
  type TemplateEditDecision,
  type TemplateEditRankingEntry,
} from "@/domain/template-edit-disambiguation";
import type { TemplateEditCandidate, TemplateEditPageContext } from "@/domain/template-edit-target";
import { buildTemplateEditRankingPrompt } from "./template-edit-ranking-prompt";

export type RankTemplateEditCandidatesInput = {
  request: string;
  page: TemplateEditPageContext | null;
  candidates: TemplateEditCandidate[];
  providerId?: string;
  model?: string;
};

export type RankTemplateEditCandidatesDependencies = {
  aiFactory: AiClientFactory;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveProviderInput(input: RankTemplateEditCandidatesInput): {
  provider: string | null;
  model: string | null;
} {
  const provider = text(input.providerId);
  const model = text(input.model);
  if ((provider === "") !== (model === "")) {
    throw new ValidationError("Choisissez à la fois le fournisseur et le modèle IA");
  }
  return { provider: provider === "" ? null : provider, model: model === "" ? null : model };
}

function confidence(value: unknown): TemplateEditConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function parseRanking(
  value: unknown,
  candidates: TemplateEditCandidate[],
): TemplateEditRankingEntry[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(
    candidates.map((candidate) => `${candidate.collection}:${candidate.itemId}`),
  );
  const ranking: TemplateEditRankingEntry[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const id = text(row.id);
    const score = typeof row.score === "number" && Number.isFinite(row.score) ? row.score : null;
    if (id === "" || score === null || !allowed.has(id)) continue;
    ranking.push({
      id,
      score: Math.max(0, Math.min(1, score)),
      ...(text(row.reason) === "" ? {} : { reason: text(row.reason) }),
    });
  }
  return ranking;
}

/** Classe les cibles déjà résolues. Aucune écriture : retourne une décision. */
export async function rankTemplateEditCandidates(
  deps: RankTemplateEditCandidatesDependencies,
  actor: Actor,
  input: RankTemplateEditCandidatesInput,
): Promise<TemplateEditDecision> {
  const organizationId = organizationOf(actor);
  assertCan(actor, "links:update");
  assertCan(actor, "ai:read");

  const candidates = input.candidates;
  if (candidates.length === 0) return { status: "not_found" };
  if (candidates.length === 1) {
    return disambiguateTemplateEdit({ request: input.request, candidates });
  }

  const { provider, model } = resolveProviderInput(input);
  const target =
    provider !== null && model !== null
      ? { organizationId, aiProviderId: provider, aiModel: model }
      : { organizationId, aiProviderId: null, aiModel: null };

  let resolved: ResolvedAiTarget;
  if (provider !== null && model !== null) {
    resolved = await deps.aiFactory.resolve(target);
  } else if (deps.aiFactory.resolveForUsage !== undefined) {
    resolved = await deps.aiFactory.resolveForUsage(target, "assistant");
  } else {
    resolved = await deps.aiFactory.resolve(target);
  }
  const resolvedTarget =
    resolved.providerId === null
      ? target
      : {
          organizationId,
          aiProviderId: resolved.providerId,
          aiModel: resolved.model,
          aiClusterId: resolved.clusterId ?? null,
        };
  const client = await deps.aiFactory.forTarget(resolvedTarget, "assistant");
  const prompt = buildTemplateEditRankingPrompt({
    request: input.request,
    page: input.page,
    candidates,
  });
  const json = await callStructuredAi(client, prompt);
  const selectedId = text(json.selectedId);

  return disambiguateTemplateEdit({
    request: input.request,
    candidates,
    ranking: parseRanking(json.ranking, candidates),
    selectedId: selectedId === "" ? null : selectedId,
    confidence: confidence(json.confidence),
  });
}
