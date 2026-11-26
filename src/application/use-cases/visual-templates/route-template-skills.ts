import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import type { AiClientFactory, ResolvedAiTarget } from "@/application/ports/ai-client-factory";
import type { LoadedTemplateSkill } from "@/application/ports/template-skill-loader";
import { callStructuredAi } from "@/application/use-cases/chatbots/structured-ai-call";
import type { TemplateEditHistoryMessage } from "./template-edit-history";
import { buildTemplateSkillRoutingPrompt } from "./template-skill-routing-prompt";

const MAX_SKILLS = 3;

export type RoutedSkill = {
  skill: LoadedTemplateSkill;
  confidence: number;
  reason: string;
};

export type RouteTemplateSkillsResult = {
  skills: RoutedSkill[];
  clarification: string | null;
  candidates: string[];
};

export type RouteTemplateSkillsDependencies = {
  aiFactory: AiClientFactory;
};

export type RouteTemplateSkillsInput = {
  request: string;
  skills: LoadedTemplateSkill[];
  history?: TemplateEditHistoryMessage[];
  providerId?: string;
  model?: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validSkills(
  value: unknown,
  allowed: Set<string>,
): Array<{
  id: string;
  confidence: number;
  reason: string;
}> {
  if (!Array.isArray(value)) return [];
  const result: Array<{ id: string; confidence: number; reason: string }> = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const id = text(row.id);
    if (id === "" || !allowed.has(id) || seen.has(id)) continue;
    const confidence =
      typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.max(0, Math.min(1, row.confidence))
        : 0.5;
    seen.add(id);
    result.push({ id, confidence, reason: text(row.reason) });
    if (result.length >= MAX_SKILLS) break;
  }
  return result;
}

function resolveProviderInput(input: RouteTemplateSkillsInput): {
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

/** Routage IA contraint : le modèle propose, le core valide. */
export async function routeTemplateSkills(
  deps: RouteTemplateSkillsDependencies,
  actor: Actor,
  input: RouteTemplateSkillsInput,
): Promise<RouteTemplateSkillsResult> {
  assertCan(actor, "links:update");
  assertCan(actor, "ai:read");
  if (input.skills.length === 0) {
    return { skills: [], clarification: null, candidates: [] };
  }

  const organizationId = organizationOf(actor);
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
  const prompt = buildTemplateSkillRoutingPrompt({
    request: input.request,
    skills: input.skills,
    ...(input.history === undefined ? {} : { history: input.history }),
  });
  const json = await callStructuredAi(client, prompt);
  const allowed = new Set(input.skills.map((entry) => entry.skill.id));
  const selected = validSkills(json.skills, allowed);
  const clarification =
    typeof json.clarification === "string" && json.clarification.trim() !== ""
      ? json.clarification.trim()
      : null;

  return {
    skills: selected.flatMap((entry) => {
      const found = input.skills.find((skill) => skill.skill.id === entry.id);
      return found === undefined
        ? []
        : [{ skill: found, confidence: entry.confidence, reason: entry.reason }];
    }),
    clarification,
    candidates: input.skills.map((entry) => entry.skill.id),
  };
}
