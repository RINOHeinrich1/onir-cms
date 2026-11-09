import { BadGatewayError, UnprocessableError } from "@/application/errors";
import type { AiClient } from "@/application/ports/ai-client";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { type RecordAiUsage, withAiUsage } from "@/application/use-cases/ai/with-ai-usage";
import { buildAttachmentPromptContext } from "@/application/use-cases/attachments/attachment-prompt";
import {
  conversationOnlyDefinition,
  ficheToDefinition,
  findFiche,
} from "@/application/use-cases/chat/chatbot-config-runtime";
import { buildCollecteState } from "@/application/use-cases/chat/collecte-state";
import {
  analyzeChatbotIntent,
  type IntentAnalysis,
  type SourcePlan,
} from "@/application/use-cases/chat/intent-analysis";
import {
  executeMissionSource,
  type MissionSourceDependencies,
  type MissionSourceResult,
  toMissionMedia,
} from "@/application/use-cases/chat/mission-sources";
import {
  interruptedAnswerMarker,
  replyLengthGuardrail,
} from "@/application/use-cases/chat/reply-length";
import { buildMissionRuntimePlan } from "@/application/use-cases/chat/runtime-plan";
import type { Attachment } from "@/domain/entities/attachment";
import type { ChatLink, ChatMessage, ChatMessageMedia, Conversation } from "@/domain/entities/chat";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { ChatbotConfig } from "@/domain/entities/chatbot-config";
import type { ChatbotInformationSources } from "@/domain/entities/chatbot-information";
import type { ConversationFicheInstance } from "@/domain/entities/conversation-fiche-instance";
import { languageReminder } from "@/domain/template-settings";
import { buildServerVariables } from "@/domain/template-variables";
import type { MessageBlock } from "@/domain/tool-blocks";
import { buildSystemPromptFromTemplate } from "@/infrastructure/ai/system-prompt";

export type MissionReplyDependencies = MissionSourceDependencies & {
  organizations: OrganizationRepository;
  links: ChatLinkRepository;
  attachments: AttachmentRepository;
  prospects: ProspectRepository;
  configs?: ChatbotConfigRepository;
  ficheInstances?: unknown;
};

export type MissionReplyInput = {
  deps: MissionReplyDependencies;
  organizationId: string;
  link: ChatLink;
  config: ChatbotConfig;
  conversation: Conversation;
  content: string;
  history: ChatMessage[];
  ai: AiClient;
  recordUsage: RecordAiUsage;
  activeInstance: ConversationFicheInstance | null;
};

export type MissionReplyResult = {
  answer: string;
  blocks: MessageBlock[];
  connaissances: { ref: string; titre: string }[];
  medias: ChatMessageMedia[];
  mediaPending: boolean;
  intent: "inform" | "collect" | "clarify";
};

function baseDefinition(config: ChatbotConfig): TemplateDefinition {
  return conversationOnlyDefinition(config);
}

function _sourcePlanLabel(plan: SourcePlan, sources: ChatbotInformationSources): string {
  if (plan.source === "fiches") return sources.fiches.label;
  if (plan.source === "connaissances") return "Connaissances";
  return "Photos et liens";
}

function sourcePrompt(
  sources: ChatbotInformationSources,
  intent: "inform" | "clarify",
  needsSources: boolean,
): string {
  const labels = [
    sources.fiches.enabled
      ? `- fiches : ${sources.fiches.label} — ${sources.fiches.usageHint}`
      : "",
    sources.connaissances.enabled ? "- connaissances : base de connaissances interne" : "",
    sources.medias.enabled ? "- médias : photos et liens internes" : "",
  ]
    .filter((entry) => entry !== "")
    .join("\n");
  return [
    intent === "clarify"
      ? "Mission : demander une clarification courte et précise, sans inventer d'information."
      : "Mission : informer le visiteur.",
    intent === "inform"
      ? "Tu ne collectes pas de nouvelle fiche. Tu ne poses aucune question de collecte."
      : "",
    labels === "" ? "" : `Sources accessibles :\n${labels}`,
    needsSources
      ? "Réponds uniquement à partir des résultats de sources fournis ci-dessous. Si une information manque, dis-le sans l'inventer."
      : "Aucune source n'est nécessaire pour ce message. Réponds de façon conversationnelle, sans inventer de fait métier.",
    "Priorité : fiches structurées > connaissances > médias.",
    "Tu ne vois pas le contenu binaire d'une image : n'invente jamais ce qu'elle montre.",
    "Ne cite pas les sources internes comme des documents secrets.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function successfulResults(
  results: PromiseSettledResult<MissionSourceResult>[],
): MissionSourceResult[] {
  return results.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
}

function sourceContext(results: MissionSourceResult[]): string {
  return results
    .filter((result) => result.context.trim() !== "")
    .map((result) => result.context)
    .join("\n\n");
}

function buildBaseSystem(
  input: MissionReplyInput,
  definition: TemplateDefinition,
  prospect: Awaited<ReturnType<ProspectRepository["findById"]>>,
): string {
  return buildSystemPromptFromTemplate({
    definition,
    serverVars: buildServerVariables({
      mode: input.link.type,
      prospect,
      conversation: input.conversation,
    }),
  });
}

async function loadProspect(input: MissionReplyInput) {
  if (input.link.type !== "specifique" || input.link.prospectId === null) return null;
  return input.deps.prospects.findById(input.organizationId, input.link.prospectId);
}

async function activeAttachments(input: MissionReplyInput): Promise<Attachment[]> {
  return input.deps.attachments.listByConversation(input.organizationId, input.conversation.id);
}

async function runCollect(
  input: MissionReplyInput,
  definition: TemplateDefinition | null,
): Promise<MissionReplyResult> {
  const fiche =
    input.activeInstance === null
      ? (input.config.fiches[0] ?? null)
      : (findFiche(input.config, input.activeInstance.ficheKey) ?? input.config.fiches[0] ?? null);
  if (fiche === null) {
    throw new UnprocessableError("Ce chatbot doit être configuré avec une fiche de collecte");
  }
  const collectDefinition = definition ?? ficheToDefinition(input.config, fiche);
  const prospect = await loadProspect(input);
  const attachments = await activeAttachments(input);
  const attachmentContext = buildAttachmentPromptContext(collectDefinition.fields, attachments);
  let system = buildBaseSystem(input, collectDefinition, prospect);
  if (attachmentContext !== "") system = `${system}\n\n${attachmentContext}`;
  if (input.activeInstance !== null) {
    const state = buildCollecteState(fiche.fields, input.activeInstance.data);
    if (state !== "") system = `${system}\n\n${state}`;
  }
  if (collectDefinition.simple !== undefined) {
    system = `${system}\n\n${languageReminder(collectDefinition.simple.language)}`;
  }
  system = `${system}\n\n${replyLengthGuardrail(input.config.replyMaxTokens ?? 400)}`;
  let answer: string;
  try {
    answer = await withAiUsage(input.ai, input.recordUsage, "chat_reply").complete({
      system,
      messages: input.history.map((message) => ({
        role: message.role === "user" ? "user" : "assistant",
        content: message.content,
      })),
      maxTokens: input.config.replyMaxTokens ?? 400,
    });
  } catch (error) {
    if (error instanceof BadGatewayError) throw error;
    throw new BadGatewayError("Service IA momentanément indisponible, réessayez");
  }
  return {
    answer,
    blocks: answer.trim() === "" ? [] : [{ type: "text", text: answer }],
    connaissances: [],
    medias: [],
    mediaPending: false,
    intent: "collect",
  };
}

async function runInform(
  input: MissionReplyInput,
  plans: SourcePlan[],
  intent: "inform" | "clarify",
  needsSources: boolean,
): Promise<MissionReplyResult> {
  const definition = baseDefinition(input.config);
  const prospect = await loadProspect(input);
  const sources = input.config.informationSources;
  if (sources === undefined) throw new UnprocessableError("Sources d'information indisponibles");
  let system = buildBaseSystem(input, definition, prospect);
  system = `${system}\n\n${sourcePrompt(sources, intent, needsSources)}`;

  const settled =
    plans.length === 0
      ? []
      : await Promise.allSettled(
          plans.map((plan) =>
            executeMissionSource({
              deps: input.deps,
              organizationId: input.organizationId,
              link: input.link,
              conversationId: input.conversation.id,
              config: input.config,
              sources,
              plan,
              content: input.content,
              history: input.history,
              ai: input.ai,
              recordUsage: input.recordUsage,
            }),
          ),
        );
  const results = successfulResults(settled);
  const context = sourceContext(results);
  if (context !== "") system = `${system}\n\nRésultats des sources :\n${context}`;
  if (definition.simple !== undefined) {
    system = `${system}\n\n${languageReminder(definition.simple.language)}`;
  }
  system = `${system}\n\n${replyLengthGuardrail(input.config.replyMaxTokens ?? 400)}`;

  let answer: string;
  let finishReason: string | null = null;
  try {
    answer = await withAiUsage(input.ai, input.recordUsage, "chat_reply").complete({
      system,
      messages: input.history.map((message) => ({
        role: message.role === "user" ? "user" : "assistant",
        content: message.content,
      })),
      maxTokens: input.config.replyMaxTokens ?? 400,
      onFinishReason: (reason) => {
        finishReason = reason;
      },
    });
  } catch (error) {
    if (error instanceof BadGatewayError) throw error;
    throw new BadGatewayError("Service IA momentanément indisponible, réessayez");
  }
  if (finishReason === "length") answer = `${answer.trim()}${interruptedAnswerMarker()}`;

  const blocks: MessageBlock[] = [];
  for (const result of results) blocks.push(...result.blocks);
  if (answer.trim() !== "") blocks.push({ type: "text", text: answer });

  return {
    answer,
    blocks,
    connaissances: results.flatMap((result) => result.connaissances),
    medias: results.flatMap((result) =>
      result.medias.map((media) => toMissionMedia(media, input.organizationId)),
    ),
    mediaPending: sources.medias.enabled && sources.medias.access === "illustration",
    intent,
  };
}

function directPlans(
  _sources: ChatbotInformationSources,
  allowed: SourcePlan["source"][],
  content: string,
): SourcePlan[] {
  return allowed.map((source) => ({
    source,
    query: content,
    ...(source === "fiches" ? { limit: 5 } : {}),
  }));
}

export async function runMissionReply(
  input: MissionReplyInput,
): Promise<MissionReplyResult | null> {
  const plan = buildMissionRuntimePlan(input.config);
  if (plan === null) return null;
  if (plan.kind === "collect") {
    return runCollect(input, null);
  }
  const sources = input.config.informationSources;
  if (sources === undefined) throw new UnprocessableError("Sources d'information indisponibles");

  if (plan.kind === "inform" && !plan.analyzer) {
    return runInform(
      input,
      directPlans(sources, plan.sources, input.content),
      "inform",
      plan.sources.length > 0,
    );
  }

  const analysis: IntentAnalysis = await analyzeChatbotIntent({
    ai: withAiUsage(input.ai, input.recordUsage, "intent"),
    message: input.content,
    history: input.history,
    mission: input.config.mission ?? "inform",
    sources,
    allowedSources: plan.sources,
    collectionActive: input.activeInstance !== null,
  });

  if (analysis.intent === "collect") {
    if (input.config.mission === "hybrid") return runCollect(input, null);
    return runInform(input, [], "clarify", false);
  }
  if (analysis.intent === "clarify") {
    return runInform(input, [], "clarify", false);
  }
  return runInform(input, analysis.sources, "inform", analysis.needsSources);
}
