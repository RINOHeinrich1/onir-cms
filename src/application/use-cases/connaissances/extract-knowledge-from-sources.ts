import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { AppError, BadGatewayError, ValidationError } from "@/application/errors";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { DocumentTextExtractor } from "@/application/ports/document-text-extractor";
import type { WebsiteContextReader } from "@/application/ports/website-context-reader";
import { CHATBOT_AI_MAX_CONTEXT_CHARS } from "@/application/use-cases/chatbots/chatbot-ai-prompt";
import {
  CHATBOT_AI_DEFAULT_MAX_DEPTH,
  CHATBOT_AI_DEFAULT_MAX_PAGES,
  CHATBOT_AI_MAX_FILE_BYTES,
  CHATBOT_AI_MAX_FILES,
  CHATBOT_AI_MAX_TOTAL_BYTES,
  type ChatbotAiUploadFile,
} from "@/application/use-cases/chatbots/generate-chatbot-ai-draft";
import { callStructuredAi } from "@/application/use-cases/chatbots/structured-ai-call";
import type { ChatbotAiKnowledgeCandidate } from "@/domain/chatbot-ai-draft";

export const KNOWLEDGE_IMPORT_MAX_URLS = 5;
const KNOWLEDGE_IMPORT_MAX_ITEMS = 20;
const KNOWLEDGE_IMPORT_MAX_TITLE = 120;
const KNOWLEDGE_IMPORT_MAX_CONTENT = 8_000;

export type ExtractKnowledgeInput = {
  files: ChatbotAiUploadFile[];
  websiteUrls: string[];
};

export type ExtractedKnowledge = {
  items: ChatbotAiKnowledgeCandidate[];
  sources: {
    pages: Array<{ url: string; title: string; chars: number }>;
    files: Array<{ name: string; chars: number; warnings: string[] }>;
    chars: number;
    truncated: boolean;
  };
  warnings: string[];
  providerLabel: string;
  providerId: string | null;
  model: string;
};

export type ExtractKnowledgeDependencies = {
  aiFactory: AiClientFactory;
  documents: DocumentTextExtractor;
  websites: WebsiteContextReader;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, KNOWLEDGE_IMPORT_MAX_TITLE);
}

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function resolveAssistantClient(deps: ExtractKnowledgeDependencies, organizationId: string) {
  const target = { organizationId, aiProviderId: null, aiModel: null };
  try {
    const resolved =
      deps.aiFactory.resolveForUsage === undefined
        ? await deps.aiFactory.resolve(target)
        : await deps.aiFactory.resolveForUsage(target, "assistant");
    return {
      client: await deps.aiFactory.forTarget(
        resolved.providerId === null
          ? target
          : {
              organizationId,
              aiProviderId: resolved.providerId,
              aiModel: resolved.model,
              aiClusterId: resolved.clusterId ?? null,
            },
        "assistant",
      ),
      providerLabel: resolved.providerLabel,
      providerId: resolved.providerId,
      model: resolved.model,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new BadGatewayError("Aucun fournisseur IA disponible pour l’import de connaissances");
  }
}

export async function extractKnowledgeFromSources(
  deps: ExtractKnowledgeDependencies,
  actor: Actor,
  input: ExtractKnowledgeInput,
): Promise<ExtractedKnowledge> {
  assertCan(actor, "connaissances:create");
  assertCan(actor, "ai:read");
  const organizationId = organizationOf(actor);

  if (input.websiteUrls.length > KNOWLEDGE_IMPORT_MAX_URLS) {
    throw new ValidationError(`Trop de liens (${KNOWLEDGE_IMPORT_MAX_URLS} maximum)`);
  }
  if (input.files.length > CHATBOT_AI_MAX_FILES) {
    throw new ValidationError(`Trop de fichiers (${CHATBOT_AI_MAX_FILES} maximum)`);
  }
  const totalBytes = input.files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (totalBytes > CHATBOT_AI_MAX_TOTAL_BYTES) {
    throw new ValidationError("La taille totale des fichiers dépasse 50 Mo");
  }
  for (const file of input.files) {
    if (file.bytes.byteLength > CHATBOT_AI_MAX_FILE_BYTES) {
      throw new ValidationError(`Le fichier « ${file.name} » dépasse 10 Mo`);
    }
  }

  const warnings: string[] = [];
  const fileSources: ExtractedKnowledge["sources"]["files"] = [];
  const sourceBlocks: string[] = [];
  for (const file of input.files) {
    try {
      const extracted = await deps.documents.extract({
        name: file.name,
        mime: file.mime,
        bytes: file.bytes,
      });
      warnings.push(...extracted.warnings.map((warning) => `${extracted.name} : ${warning}`));
      fileSources.push({
        name: extracted.name,
        chars: extracted.chars,
        warnings: extracted.warnings,
      });
      if (extracted.text.trim() !== "") {
        sourceBlocks.push(
          `DOCUMENT « ${extracted.name} » :\n${extracted.text.trim().slice(0, KNOWLEDGE_IMPORT_MAX_CONTENT)}`,
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new BadGatewayError(`Lecture impossible du document « ${file.name} »`);
    }
  }

  const pageSources: ExtractedKnowledge["sources"]["pages"] = [];
  const urls = [
    ...new Set(
      input.websiteUrls
        .map((url) => normalizeUrl(url))
        .filter((url): url is string => url !== null),
    ),
  ];
  for (const url of urls) {
    try {
      const site = await deps.websites.read(url, {
        maxPages: CHATBOT_AI_DEFAULT_MAX_PAGES,
        maxDepth: CHATBOT_AI_DEFAULT_MAX_DEPTH,
      });
      warnings.push(...site.warnings.map((warning) => `${url} : ${warning}`));
      for (const page of site.pages) {
        pageSources.push({ url: page.url, title: page.title, chars: page.text.length });
        if (page.text.trim() !== "") {
          sourceBlocks.push(
            `PAGE « ${page.title || page.url} » (${page.url}) :\n${page.text.trim().slice(0, KNOWLEDGE_IMPORT_MAX_CONTENT)}`,
          );
        }
      }
    } catch (error) {
      warnings.push(`${url} : ${error instanceof Error ? error.message : "lecture impossible"}`);
    }
  }

  if (sourceBlocks.length === 0) {
    throw new ValidationError("Aucun contenu exploitable dans les documents ou les sites fournis");
  }

  const sourceText = sourceBlocks.join("\n\n").slice(0, CHATBOT_AI_MAX_CONTEXT_CHARS);
  const truncated = sourceBlocks.join("\n\n").length > CHATBOT_AI_MAX_CONTEXT_CHARS;
  if (truncated)
    warnings.push("Le contenu source a été tronqué pour rester dans la limite du modèle.");

  const { client, providerLabel, providerId, model } = await resolveAssistantClient(
    deps,
    organizationId,
  );
  const raw = await callStructuredAi(client, {
    system: `Tu extrais des connaissances fiables pour une base de connaissances ONIR CMS.

RÈGLES :
- Réponds uniquement avec un objet JSON valide : {"knowledge":[{"titre":"...","contenu":"..."}],"warnings":[]}.
- Chaque titre doit être court, unique et descriptif (120 caractères maximum).
- Chaque contenu doit être factuel, autonome et concis (8 000 caractères maximum).
- Recopie EXACTEMENT les téléphones, emails, URL, adresses et noms fournis.
- Ne remplace jamais une coordonnée par une mention générique.
- N'invente aucune information absente des sources.
- Ne crée pas de doublons de titre.
- Ne mentionne pas le nom du fichier ou de la page dans le contenu sauf si c'est une information utile.
- Ignore la navigation, les menus, les cookies et le bruit des pages.
- Maximum 20 connaissances.`,
    user: `SOURCES FOURNIES PAR L'UTILISATEUR :

${sourceText}

Extrais les connaissances utiles dans le JSON attendu.`,
  });

  const rawKnowledge = Array.isArray(raw.knowledge) ? raw.knowledge : [];
  const items: ChatbotAiKnowledgeCandidate[] = [];
  const seen = new Set<string>();
  for (const entry of rawKnowledge) {
    const item = record(entry);
    const titre = normalizeTitle(text(item.titre));
    const contenu = text(item.contenu).slice(0, KNOWLEDGE_IMPORT_MAX_CONTENT);
    if (titre === "" || contenu === "") continue;
    const key = titre.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ titre, contenu });
    if (items.length >= KNOWLEDGE_IMPORT_MAX_ITEMS) break;
  }
  if (items.length === 0) {
    throw new BadGatewayError("L’IA n’a extrait aucune connaissance exploitable");
  }
  for (const warning of Array.isArray(raw.warnings) ? raw.warnings : []) {
    if (typeof warning === "string" && warning.trim() !== "") warnings.push(warning.trim());
  }

  const chars =
    pageSources.reduce((sum, page) => sum + page.chars, 0) +
    fileSources.reduce((sum, file) => sum + file.chars, 0);
  return {
    items,
    sources: { pages: pageSources, files: fileSources, chars, truncated },
    warnings: [...new Set(warnings)],
    providerLabel,
    providerId,
    model,
  };
}
