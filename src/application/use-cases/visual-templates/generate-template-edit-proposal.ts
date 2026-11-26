import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import type { AiClientFactory, ResolvedAiTarget } from "@/application/ports/ai-client-factory";
import { callStructuredAi } from "@/application/use-cases/chatbots/structured-ai-call";
import {
  applyTemplateEditProposal,
  type TemplateEditOperation,
  type TemplateEditProposal,
} from "@/domain/template-edit-proposal";
import type { TemplateEditCandidate, TemplateEditPageContext } from "@/domain/template-edit-target";
import type { TemplateEditorManifest } from "@/domain/template-editor";
import type { TemplateParamSchema, TemplateParamValues } from "@/domain/template-params";
import { buildTemplateEditProposalPrompt } from "./template-edit-proposal-prompt";

export type GenerateTemplateEditProposalInput = {
  request: string;
  page: TemplateEditPageContext | null;
  candidate: TemplateEditCandidate;
  editor: TemplateEditorManifest;
  schema: TemplateParamSchema[];
  values: TemplateParamValues;
  providerId?: string;
  model?: string;
};

export type GenerateTemplateEditProposalDependencies = {
  aiFactory: AiClientFactory;
};

export type GenerateTemplateEditProposalResult = {
  proposal: TemplateEditProposal;
  values: TemplateParamValues;
  warnings: string[];
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveProviderInput(input: GenerateTemplateEditProposalInput): {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseProposal(value: Record<string, unknown>): TemplateEditProposal | null {
  if (!Array.isArray(value.operations) || value.operations.length === 0) return null;
  const operations = value.operations.filter(isRecord);
  if (operations.length !== value.operations.length) return null;
  if (operations.some((operation) => text(operation.op) === "")) return null;
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  return {
    operations: operations as unknown as TemplateEditOperation[],
    warnings,
  };
}

/** Génère une proposition d'édition et la valide, sans écriture. */
export async function generateTemplateEditProposal(
  deps: GenerateTemplateEditProposalDependencies,
  actor: Actor,
  input: GenerateTemplateEditProposalInput,
): Promise<GenerateTemplateEditProposalResult> {
  const organizationId = organizationOf(actor);
  assertCan(actor, "links:update");
  assertCan(actor, "ai:read");

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
  const prompt = buildTemplateEditProposalPrompt({
    request: input.request,
    page: input.page,
    candidate: input.candidate,
    editor: input.editor,
    schema: input.schema,
    values: input.values,
  });
  const json = await callStructuredAi(client, prompt);
  const proposal = parseProposal(json);
  if (proposal === null) {
    throw new ValidationError("L’IA n’a pas proposé de modification exploitable.");
  }

  let applied: ReturnType<typeof applyTemplateEditProposal>;
  try {
    applied = applyTemplateEditProposal({
      editor: input.editor,
      schema: input.schema,
      values: input.values,
      proposal,
    });
  } catch {
    throw new ValidationError("La proposition de l’IA est mal formée.");
  }
  if (!applied.ok) {
    throw new ValidationError(
      `Proposition refusée : ${applied.errors.map((error) => `${error.field} — ${error.message}`).join(" ; ")}`,
    );
  }

  return {
    proposal,
    values: applied.values,
    warnings: [...(proposal.warnings ?? []), ...applied.warnings],
  };
}
