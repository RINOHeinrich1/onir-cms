import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { AiClient } from "@/application/ports/ai-client";
import type { AiClientFactory, ResolvedAiTarget } from "@/application/ports/ai-client-factory";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import { callStructuredAi } from "@/application/use-cases/chatbots/structured-ai-call";
import type { SitePalette } from "@/domain/site-palette";
import {
  resolveTemplateParams,
  type TemplateParamSchema,
  type TemplateParamValues,
} from "@/domain/template-params";
import { buildChatbotTemplateParamsPrompt } from "./chatbot-template-params-prompt";

const MAX_DESCRIPTION_CHARS = 4_000;

export type GenerateChatbotTemplateParamsInput = {
  templateId: string;
  templateVersion: string;
  chatbot: {
    label: string;
    description: string;
    role: string;
    objective: string;
    tone: string;
    extraInstructions: string;
  };
  knowledge: Array<{ titre: string; contenu: string }>;
  palette: SitePalette;
  description?: string;
  providerId?: string;
  model?: string;
};

export type GenerateChatbotTemplateParamsResult = {
  params: TemplateParamValues;
  warnings: string[];
};

export type ChatbotTemplateParamsDependencies = {
  aiFactory: AiClientFactory;
  visualTemplates: VisualTemplateRepository;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveProviderInput(input: GenerateChatbotTemplateParamsInput): {
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

/** Remplit les paramètres statiques du template widget sélectionné, sans écriture. */
export async function generateChatbotTemplateParams(
  deps: ChatbotTemplateParamsDependencies,
  actor: Actor,
  input: GenerateChatbotTemplateParamsInput,
): Promise<GenerateChatbotTemplateParamsResult> {
  const organizationId = organizationOf(actor);
  assertCan(actor, "links:create");
  assertCan(actor, "ai:read");

  const templateId = text(input.templateId);
  const templateVersion = text(input.templateVersion);
  const label = text(input.chatbot.label);
  if (templateId === "" || templateVersion === "") {
    throw new ValidationError("Template et version requis");
  }
  if (label === "") throw new ValidationError("Libellé du chatbot requis");
  if (input.chatbot.description.length > MAX_DESCRIPTION_CHARS) {
    input.chatbot.description = input.chatbot.description.slice(0, MAX_DESCRIPTION_CHARS);
  }

  const template = await deps.visualTemplates.findAssignedById(organizationId, templateId);
  if (template === null) throw new NotFoundError("Template introuvable");
  const version = await deps.visualTemplates.findVersion(templateId, templateVersion);
  if (version === null) throw new NotFoundError("Version de template introuvable");

  const schema: TemplateParamSchema[] = version.manifest.params;
  const fillable = schema.filter((param) => param.type !== "url");
  if (fillable.length === 0) {
    return { params: resolveTemplateParams(schema, {}), warnings: [] };
  }

  const { provider, model } = resolveProviderInput(input);
  const target =
    provider !== null && model !== null
      ? { organizationId, aiProviderId: provider, aiModel: model }
      : { organizationId, aiProviderId: null, aiModel: null };

  let resolved: ResolvedAiTarget;
  let client: AiClient;
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
      : { organizationId, aiProviderId: resolved.providerId, aiModel: resolved.model };
  client = await deps.aiFactory.forTarget(resolvedTarget);

  const prompt = buildChatbotTemplateParamsPrompt({
    chatbot: {
      label,
      description: input.chatbot.description,
      role: input.chatbot.role,
      objective: input.chatbot.objective,
      tone: input.chatbot.tone,
      extraInstructions: input.chatbot.extraInstructions,
    },
    knowledge: input.knowledge,
    palette: input.palette,
    params: schema,
  });
  const json = await callStructuredAi(client, prompt);
  const rawParams =
    json.params !== null && typeof json.params === "object" && !Array.isArray(json.params)
      ? json.params
      : {};

  const warnings: string[] = [];
  if (input.palette.confidence === "low" || input.palette.confidence === "none") {
    warnings.push(
      "La palette du site est peu fiable : les couleurs ont été proposées à partir de la description et des connaissances.",
    );
  }

  const strictParams = Object.fromEntries(
    Object.entries(rawParams).filter(([key]) => {
      const param = schema.find((entry) => entry.key === key);
      return param !== undefined && param.type !== "url";
    }),
  );

  return {
    params: resolveTemplateParams(schema, strictParams),
    warnings,
  };
}
