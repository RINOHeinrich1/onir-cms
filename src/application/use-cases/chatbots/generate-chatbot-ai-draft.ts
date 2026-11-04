/** Génération d'un brouillon de chatbot assisté par IA, sans écriture legacy. */

import { randomUUID } from "node:crypto";
import { type Actor, assertCan, organizationOf } from "@/application/actor";
import {
  AiNotConfiguredError,
  AppError,
  BadGatewayError,
  ValidationError,
} from "@/application/errors";
import type { AiClient } from "@/application/ports/ai-client";
import type { AiClientFactory, ResolvedAiTarget } from "@/application/ports/ai-client-factory";
import type {
  DocumentInput,
  DocumentTextExtractor,
} from "@/application/ports/document-text-extractor";
import type {
  WebsiteContextReader,
  WebsiteCrawlOptions,
} from "@/application/ports/website-context-reader";
import {
  buildChatbotAiPrompt,
  CHATBOT_AI_MAX_CONTEXT_CHARS,
} from "@/application/use-cases/chatbots/chatbot-ai-prompt";
import { callStructuredAi } from "@/application/use-cases/chatbots/structured-ai-call";
import {
  type ChatbotAiDraft,
  type ChatbotAiKnowledgeCandidate,
  extractAiJsonObject,
  parseChatbotAiDraft,
} from "@/domain/chatbot-ai-draft";
import { EMPTY_SITE_PALETTE, type SitePalette } from "@/domain/site-palette";
import { toTemplateKey } from "@/domain/template-defaults";

export const CHATBOT_AI_MAX_FILES = 5;
export const CHATBOT_AI_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const CHATBOT_AI_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const CHATBOT_AI_MAX_DESCRIPTION_CHARS = 4_000;
/** Paliers de secours pour les modèles qui consomment le budget en raisonnement. */
export const CHATBOT_AI_TOKEN_BUDGETS = [4_000, 8_000, 12_000] as const;
export const CHATBOT_AI_DEFAULT_MAX_PAGES = 5;
export const CHATBOT_AI_DEFAULT_MAX_DEPTH = 1;

export type ChatbotAiUploadFile = {
  name: string;
  mime: string;
  bytes: Uint8Array;
};

export type GenerateChatbotAiInput = {
  description: string;
  websiteUrl?: string;
  files: ChatbotAiUploadFile[];
  providerId?: string;
  model?: string;
  crawl?: {
    maxPages?: number;
    maxDepth?: number;
  };
};

export type ChatbotAiGenerationSourceSummary = {
  pages: Array<{ url: string; title: string; chars: number }>;
  files: Array<{ name: string; chars: number; warnings: string[] }>;
  chars: number;
  truncated: boolean;
};

export type ChatbotAiGenerationResult = {
  generationId: string;
  key: string;
  draft: ChatbotAiDraft;
  sources: ChatbotAiGenerationSourceSummary;
  warnings: string[];
  existingAiKnowledgeCount: number;
  providerLabel: string;
  providerId: string | null;
  model: string;
  sitePalette: SitePalette;
};

export type ChatbotAiGenerationDependencies = {
  aiFactory: AiClientFactory;
  documents: DocumentTextExtractor;
  websites: WebsiteContextReader;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampCrawl(options: GenerateChatbotAiInput["crawl"]): WebsiteCrawlOptions {
  const requestedPages =
    options?.maxPages === undefined ? CHATBOT_AI_DEFAULT_MAX_PAGES : options.maxPages;
  const requestedDepth =
    options?.maxDepth === undefined ? CHATBOT_AI_DEFAULT_MAX_DEPTH : options.maxDepth;
  const pages = Number.isFinite(requestedPages) ? requestedPages : CHATBOT_AI_DEFAULT_MAX_PAGES;
  const depth = Number.isFinite(requestedDepth) ? requestedDepth : CHATBOT_AI_DEFAULT_MAX_DEPTH;
  return {
    maxPages: Math.max(1, Math.min(10, Math.trunc(pages))),
    maxDepth: Math.max(0, Math.min(2, Math.trunc(depth))),
  };
}

function parseNullableProvider(value: unknown): string | null {
  const provider = text(value);
  return provider === "" ? null : provider;
}

function knowledgeTitle(value: string, fallback: string): string {
  const title = value.replace(/\s+/g, " ").trim() || fallback;
  return title.slice(0, 120);
}

function sourceKnowledgeFromPage(page: {
  url: string;
  title: string;
  text: string;
}): ChatbotAiKnowledgeCandidate | null {
  const contenu = page.text.trim();
  if (contenu === "") return null;
  return {
    titre: knowledgeTitle(page.title, page.url),
    contenu: contenu.slice(0, 8_000),
    source: { type: "page", url: page.url },
  };
}

function buildSourceKnowledge(
  pages: Array<{ url: string; title: string; text: string }>,
  documents: Array<{ name: string; text: string; chars: number }>,
): ChatbotAiKnowledgeCandidate[] {
  const items: ChatbotAiKnowledgeCandidate[] = [];
  for (const page of pages) {
    const item = sourceKnowledgeFromPage(page);
    if (item !== null) items.push(item);
  }
  for (const document of documents) {
    const contenu = document.text.trim();
    if (contenu === "") continue;
    items.push({
      titre: knowledgeTitle(document.name, "Document"),
      contenu: contenu.slice(0, 8_000),
      source: { type: "document", filename: document.name },
    });
  }
  return items;
}

function mergeKnowledge(
  source: ChatbotAiKnowledgeCandidate[],
  generated: ChatbotAiKnowledgeCandidate[],
): ChatbotAiKnowledgeCandidate[] {
  const result: ChatbotAiKnowledgeCandidate[] = [];
  const titles = new Set<string>();
  for (const item of [...source, ...generated]) {
    const title = knowledgeTitle(item.titre, "Connaissance");
    const fingerprint = title.toLocaleLowerCase("fr");
    if (titles.has(fingerprint)) continue;
    titles.add(fingerprint);
    result.push({ ...item, titre: title });
    if (result.length >= 20) break;
  }
  return result;
}

/** Génère un brouillon sans aucune écriture en base. */
export async function generateChatbotAiDraft(
  deps: ChatbotAiGenerationDependencies,
  actor: Actor,
  input: GenerateChatbotAiInput,
): Promise<ChatbotAiGenerationResult> {
  const organizationId = organizationOf(actor);
  assertCan(actor, "links:create");
  assertCan(actor, "ai:read");

  const description = text(input.description);
  if (description === "") throw new ValidationError("La description du chatbot est obligatoire");
  if (description.length > CHATBOT_AI_MAX_DESCRIPTION_CHARS) {
    throw new ValidationError(
      `La description est trop longue (${CHATBOT_AI_MAX_DESCRIPTION_CHARS} caractères maximum)`,
    );
  }

  const provider = parseNullableProvider(input.providerId);
  const model = parseNullableProvider(input.model);
  if ((provider === null) !== (model === null)) {
    throw new ValidationError("Choisissez à la fois le fournisseur et le modèle IA");
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
  const extractedDocuments = [];
  for (const file of input.files) {
    const document: DocumentInput = {
      name: file.name,
      mime: file.mime,
      bytes: file.bytes,
    };
    try {
      const extracted = await deps.documents.extract(document);
      warnings.push(...extracted.warnings.map((warning) => `${extracted.name} : ${warning}`));
      extractedDocuments.push(extracted);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new BadGatewayError(`Lecture impossible du document « ${document.name} »`);
    }
  }

  let website = "";
  let websitePages: Array<{ url: string; title: string; text: string }> = [];
  let websiteSummary: ChatbotAiGenerationSourceSummary["pages"] = [];
  let websiteTruncated = false;
  let sitePalette: SitePalette = EMPTY_SITE_PALETTE;
  const websiteUrl = text(input.websiteUrl);
  if (websiteUrl !== "") {
    try {
      const crawled = await deps.websites.read(websiteUrl, clampCrawl(input.crawl));
      warnings.push(...crawled.warnings);
      websitePages = crawled.pages;
      sitePalette = crawled.palette;
      website = crawled.pages
        .map((page) => `--- PAGE : ${page.url} ---\n${page.text}`)
        .join("\n\n");
      websiteSummary = crawled.pages.map((page) => ({
        url: page.url,
        title: page.title,
        chars: page.text.length,
      }));
      websiteTruncated = crawled.truncated;
    } catch (error) {
      warnings.push(
        `Site non analysé : ${error instanceof Error ? error.message : "lecture impossible"}.`,
      );
    }
  }

  const documentText = extractedDocuments.map((document) => document.text).join("\n\n");
  const totalChars = website.length + documentText.length;
  if (totalChars > CHATBOT_AI_MAX_CONTEXT_CHARS) {
    warnings.push("Le contexte a été tronqué pour respecter la limite d'analyse.");
  }

  const target =
    provider !== null && model !== null
      ? { organizationId, aiProviderId: provider, aiModel: model }
      : { organizationId, aiProviderId: null, aiModel: null };

  let resolved: ResolvedAiTarget;
  let client: AiClient;
  try {
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
          };
    client = await deps.aiFactory.forTarget(resolvedTarget);
  } catch (error) {
    if (error instanceof AiNotConfiguredError || error instanceof AppError) throw error;
    throw new BadGatewayError("Aucun fournisseur IA disponible pour cette génération");
  }

  const prompt = buildChatbotAiPrompt({
    description,
    website,
    documents: extractedDocuments.map((document) => ({
      name: document.name,
      text: document.text,
    })),
    existing: null,
  });

  const json = await callStructuredAi(client, {
    system: prompt.system,
    user: prompt.user,
  });

  const suggestedLabel = text((json as Record<string, unknown>).label);
  const key = toTemplateKey(suggestedLabel);

  const parsed = parseChatbotAiDraft(json, {
    key,
    descriptionFallback: description,
  });
  if (!parsed.ok) throw new ValidationError(parsed.errors.join(" ; "));

  const sourceKnowledge = buildSourceKnowledge(websitePages, extractedDocuments);
  const generatedKnowledge = parsed.value.knowledge;
  const mergedKnowledge = mergeKnowledge(sourceKnowledge, generatedKnowledge);
  if (websiteUrl !== "" && websiteSummary.length === 0) {
    warnings.push(
      "Le site n’a fourni aucune page exploitable. Ajoutez un document ou complétez la description.",
    );
  }
  if (sourceKnowledge.length > 0) {
    warnings.push(
      `${sourceKnowledge.length} connaissance(s) issue(s) des sources ont été ajoutées au brouillon.`,
    );
  }
  const allWarnings = [...new Set([...warnings, ...parsed.value.warnings])];
  const draft: ChatbotAiDraft = {
    ...parsed.value,
    knowledge: mergedKnowledge,
  };
  const existingAiKnowledgeCount = 0;

  return {
    generationId: randomUUID(),
    key,
    draft,
    sources: {
      pages: websiteSummary,
      files: extractedDocuments.map((document) => ({
        name: document.name,
        chars: document.chars,
        warnings: document.warnings,
      })),
      chars: totalChars,
      truncated: websiteTruncated || totalChars > CHATBOT_AI_MAX_CONTEXT_CHARS,
    },
    warnings: allWarnings,
    existingAiKnowledgeCount,
    providerLabel: resolved.providerLabel,
    providerId: resolved.providerId,
    model: resolved.model,
    sitePalette,
  };
}
