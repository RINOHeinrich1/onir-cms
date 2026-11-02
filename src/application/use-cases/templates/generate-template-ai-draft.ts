/** Génération d'un brouillon de modèle assisté par IA (ADR-0038). */

import { randomUUID } from "node:crypto";
import { type Actor, assertCan, organizationOf } from "@/application/actor";
import {
  AiNotConfiguredError,
  AppError,
  BadGatewayError,
  NotFoundError,
  ValidationError,
} from "@/application/errors";
import type { AiClient } from "@/application/ports/ai-client";
import type { AiClientFactory, ResolvedAiTarget } from "@/application/ports/ai-client-factory";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type {
  DocumentInput,
  DocumentTextExtractor,
} from "@/application/ports/document-text-extractor";
import type {
  WebsiteContextReader,
  WebsiteCrawlOptions,
} from "@/application/ports/website-context-reader";
import {
  buildTemplateAiPrompt,
  TEMPLATE_AI_MAX_CONTEXT_CHARS,
} from "@/application/use-cases/templates/template-ai-prompt";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import {
  extractAiJsonObject,
  parseTemplateAiDraft,
  type TemplateAiDraft,
  type TemplateAiKnowledgeCandidate,
} from "@/domain/template-ai-draft";
import { toTemplateKey, uniqueTemplateKey } from "@/domain/template-defaults";

export const TEMPLATE_AI_MAX_FILES = 5;
export const TEMPLATE_AI_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const TEMPLATE_AI_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const TEMPLATE_AI_MAX_DESCRIPTION_CHARS = 4_000;
export const TEMPLATE_AI_DEFAULT_MAX_PAGES = 5;
export const TEMPLATE_AI_DEFAULT_MAX_DEPTH = 1;

export type TemplateAiUploadFile = {
  name: string;
  mime: string;
  bytes: Uint8Array;
};

export type GenerateTemplateAiInput = {
  description: string;
  websiteUrl?: string;
  files: TemplateAiUploadFile[];
  providerId?: string;
  model?: string;
  templateKey?: string;
  /** Permission requise : template (défaut) ou création de chatbot. */
  requiredPermission?: "templates:create" | "links:create";
  crawl?: {
    maxPages?: number;
    maxDepth?: number;
  };
};

export type TemplateAiGenerationSourceSummary = {
  pages: Array<{ url: string; title: string; chars: number }>;
  files: Array<{ name: string; chars: number; warnings: string[] }>;
  chars: number;
  truncated: boolean;
};

export type TemplateAiGenerationResult = {
  generationId: string;
  key: string;
  draft: TemplateAiDraft;
  sources: TemplateAiGenerationSourceSummary;
  warnings: string[];
  existingAiKnowledgeCount: number;
  providerLabel: string;
  model: string;
};

export type TemplateAiGenerationDependencies = {
  aiFactory: AiClientFactory;
  documents: DocumentTextExtractor;
  websites: WebsiteContextReader;
  templates: ChatTemplateRepository;
  connaissances: ConnaissanceRepository;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampCrawl(options: GenerateTemplateAiInput["crawl"]): WebsiteCrawlOptions {
  const requestedPages =
    options?.maxPages === undefined ? TEMPLATE_AI_DEFAULT_MAX_PAGES : options.maxPages;
  const requestedDepth =
    options?.maxDepth === undefined ? TEMPLATE_AI_DEFAULT_MAX_DEPTH : options.maxDepth;
  const pages = Number.isFinite(requestedPages) ? requestedPages : TEMPLATE_AI_DEFAULT_MAX_PAGES;
  const depth = Number.isFinite(requestedDepth) ? requestedDepth : TEMPLATE_AI_DEFAULT_MAX_DEPTH;
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
}): TemplateAiKnowledgeCandidate | null {
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
): TemplateAiKnowledgeCandidate[] {
  const items: TemplateAiKnowledgeCandidate[] = [];
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
  source: TemplateAiKnowledgeCandidate[],
  generated: TemplateAiKnowledgeCandidate[],
): TemplateAiKnowledgeCandidate[] {
  const result: TemplateAiKnowledgeCandidate[] = [];
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
export async function generateTemplateAiDraft(
  deps: TemplateAiGenerationDependencies,
  actor: Actor,
  input: GenerateTemplateAiInput,
): Promise<TemplateAiGenerationResult> {
  const organizationId = organizationOf(actor);
  const templateKey = text(input.templateKey) === "" ? null : text(input.templateKey);
  assertCan(
    actor,
    templateKey === null ? (input.requiredPermission ?? "templates:create") : "templates:update",
  );
  assertCan(actor, "ai:read");

  const description = text(input.description);
  if (description === "") throw new ValidationError("La description du chatbot est obligatoire");
  if (description.length > TEMPLATE_AI_MAX_DESCRIPTION_CHARS) {
    throw new ValidationError(
      `La description est trop longue (${TEMPLATE_AI_MAX_DESCRIPTION_CHARS} caractères maximum)`,
    );
  }

  const provider = parseNullableProvider(input.providerId);
  const model = parseNullableProvider(input.model);
  if ((provider === null) !== (model === null)) {
    throw new ValidationError("Choisissez à la fois le fournisseur et le modèle IA");
  }

  if (input.files.length > TEMPLATE_AI_MAX_FILES) {
    throw new ValidationError(`Trop de fichiers (${TEMPLATE_AI_MAX_FILES} maximum)`);
  }
  const totalBytes = input.files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (totalBytes > TEMPLATE_AI_MAX_TOTAL_BYTES) {
    throw new ValidationError("La taille totale des fichiers dépasse 50 Mo");
  }
  for (const file of input.files) {
    if (file.bytes.byteLength > TEMPLATE_AI_MAX_FILE_BYTES) {
      throw new ValidationError(`Le fichier « ${file.name} » dépasse 10 Mo`);
    }
  }

  let existingDefinition: TemplateDefinition | null = null;
  const existingTemplates = templateKey === null ? await deps.templates.list(organizationId) : [];
  if (templateKey !== null) {
    const existing = await deps.templates.findByKey(organizationId, templateKey);
    if (existing === null) throw new NotFoundError("Modèle introuvable");
    const version = await deps.templates.currentVersion(organizationId, templateKey);
    existingDefinition = version?.definition ?? null;
  } else if (existingTemplates.length > 100) {
    throw new ValidationError("Trop de modèles existants pour générer une clé unique");
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
  let websiteSummary: TemplateAiGenerationSourceSummary["pages"] = [];
  let websiteTruncated = false;
  const websiteUrl = text(input.websiteUrl);
  if (websiteUrl !== "") {
    try {
      const crawled = await deps.websites.read(websiteUrl, clampCrawl(input.crawl));
      warnings.push(...crawled.warnings);
      websitePages = crawled.pages;
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
  if (totalChars > TEMPLATE_AI_MAX_CONTEXT_CHARS) {
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

  const prompt = buildTemplateAiPrompt({
    description,
    website,
    documents: extractedDocuments.map((document) => ({
      name: document.name,
      text: document.text,
    })),
    existing: existingDefinition,
  });

  let raw: string;
  try {
    raw = await client.complete({
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
      maxTokens: 4_000,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new BadGatewayError(error instanceof Error ? error.message : "La génération IA a échoué");
  }

  const json = extractAiJsonObject(raw);
  if (json === null) {
    throw new BadGatewayError("L'IA n'a pas renvoyé un JSON exploitable. Réessayez.");
  }
  const suggestedLabel = text((json as Record<string, unknown>).label);
  const key =
    templateKey ??
    uniqueTemplateKey(
      toTemplateKey(suggestedLabel),
      existingTemplates.map((template) => template.key),
    );

  const parsed = parseTemplateAiDraft(json, {
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
  const draft: TemplateAiDraft = {
    ...parsed.value,
    knowledge: mergedKnowledge,
  };
  const existingAiKnowledgeCount =
    templateKey === null ? 0 : await deps.connaissances.countAiByTemplate(organizationId, key);

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
      truncated: websiteTruncated || totalChars > TEMPLATE_AI_MAX_CONTEXT_CHARS,
    },
    warnings: allWarnings,
    existingAiKnowledgeCount,
    providerLabel: resolved.providerLabel,
    model: resolved.model,
  };
}
