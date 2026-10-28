import type { AiClient, AiMessage } from "@/application/ports/ai-client";
import type {
  ConversationFicheInstanceRepository,
  UpsertFicheInstanceInput,
} from "@/application/ports/conversation-fiche-instance-repository";
import { parseExtractionJson } from "@/application/use-cases/fiche/draft-fiche";
import type { ChatbotConfig, FicheDefinition } from "@/domain/entities/chatbot-config";
import {
  type ConversationFicheInstance,
  type FicheInstanceStatus,
  isFicheInstanceStatus,
  normalizeMissingFields,
} from "@/domain/entities/conversation-fiche-instance";

export type DetectedFicheInstance = {
  ficheKey: string;
  status: FicheInstanceStatus;
  data: Record<string, unknown>;
  missingFields: string[];
  abandonReason: string | null;
};

/** Retrouve l'instance d'une fiche (instance par défaut) dans une liste. */
export function instanceForFiche(
  instances: readonly ConversationFicheInstance[],
  ficheKey: string,
): ConversationFicheInstance | null {
  return instances.find((instance) => instance.ficheKey === ficheKey) ?? null;
}

/**
 * Mono-fiche : la première fiche est utilisée automatiquement comme active.
 * L'instance existante est conservée (données jamais perdues).
 */
export async function ensureMonoFicheInstance(
  repo: ConversationFicheInstanceRepository,
  config: ChatbotConfig,
  conversationId: string,
  organizationId: string,
): Promise<ConversationFicheInstance | null> {
  const fiche = config.fiches[0];
  if (fiche === undefined) return null;
  const instances = await repo.listByConversation(organizationId, conversationId);
  const existing = instanceForFiche(instances, fiche.key);
  if (existing === null) {
    const created = await repo.upsert({
      organizationId,
      conversationId,
      configId: config.id,
      ficheKey: fiche.key,
      status: "active",
      data: {},
      missingFields: fiche.fields.filter((field) => field.required).map((field) => field.name),
    });
    return created;
  }
  if (existing.status === "detected" || existing.status === "paused") {
    return repo.activate(organizationId, conversationId, existing.id);
  }
  return existing;
}

/** Repli robuste : au moins la fiche principale reste active. */
export async function ensurePrimaryFicheActive(
  repo: ConversationFicheInstanceRepository,
  config: ChatbotConfig,
  conversationId: string,
  organizationId: string,
): Promise<ConversationFicheInstance | null> {
  const fiche = config.fiches[0];
  if (fiche === undefined) return null;
  const instances = await repo.listByConversation(organizationId, conversationId);
  const active = instances.find((instance) => instance.status === "active");
  if (active !== undefined) return active;
  const existing = instanceForFiche(instances, fiche.key);
  if (existing === null) {
    return repo.upsert({
      organizationId,
      conversationId,
      configId: config.id,
      ficheKey: fiche.key,
      status: "active",
      data: {},
      missingFields: fiche.fields.filter((field) => field.required).map((field) => field.name),
    });
  }
  if (existing.status === "complete" || existing.status === "abandoned") return existing;
  return repo.activate(organizationId, conversationId, existing.id);
}

function ficheGuide(fiche: FicheDefinition): string {
  const fields = fiche.fields.filter((field) => field.type !== "file");
  const list = fields.map((field) => {
    const required = field.required ? "obligatoire" : "facultatif";
    const options =
      field.options !== undefined && field.options.length > 0
        ? ` — valeurs : ${field.options.join(", ")}`
        : "";
    return `  - ${field.name} (${field.label}, ${required})${options}`;
  });
  return [
    `- ficheKey "${fiche.key}" : ${fiche.label}`,
    fiche.description.trim() === "" ? "" : `  ${fiche.description.trim()}`,
    fiche.intent.trim() === "" ? "" : `  Intention : ${fiche.intent.trim()}`,
    ...list,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Consigne structurée de détection multi-fiches (une seule active). */
export function buildFicheDetectionPrompt(config: ChatbotConfig): string {
  return [
    "Tu analyses une conversation pour déterminer quelles fiches de collecte sont concernées.",
    "Fiches disponibles :",
    ...config.fiches.map(ficheGuide),
    "",
    "Réponds UNIQUEMENT avec un objet JSON strict, sans texte autour :",
    '{"instances":[{"ficheKey":"...","status":"detected|active|paused|complete|abandoned","data":{},"missingFields":[],"abandonReason":null}]}',
    "Règles :",
    "- Une seule fiche peut être au statut active.",
    "- complete si toutes les informations obligatoires de la fiche sont connues.",
    "- paused si la fiche a été commencée puis mise en attente au profit d'une autre.",
    "- abandoned uniquement si la conversation indique un abandon explicite.",
    "- data : valeurs connues indexées par le nom technique des champs.",
    "- missingFields : noms techniques des champs obligatoires encore inconnus.",
    "- N'invente aucune valeur ; n'ajoute aucune fiche inconnue.",
  ].join("\n");
}

function parseDetectedInstances(
  parsed: unknown,
  config: ChatbotConfig,
): DetectedFicheInstance[] | null {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const raw = (parsed as Record<string, unknown>).instances;
  if (!Array.isArray(raw)) return null;
  const known = new Set(config.fiches.map((fiche) => fiche.key));
  const seen = new Set<string>();
  const result: DetectedFicheInstance[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const ficheKey = typeof record.ficheKey === "string" ? record.ficheKey.trim() : "";
    if (!known.has(ficheKey) || seen.has(ficheKey)) continue;
    seen.add(ficheKey);
    const statusRaw = typeof record.status === "string" ? record.status : "detected";
    const status: FicheInstanceStatus = isFicheInstanceStatus(statusRaw) ? statusRaw : "detected";
    const data =
      record.data !== null && typeof record.data === "object" && !Array.isArray(record.data)
        ? (record.data as Record<string, unknown>)
        : {};
    result.push({
      ficheKey,
      status,
      data,
      missingFields: normalizeMissingFields(record.missingFields),
      abandonReason: typeof record.abandonReason === "string" ? record.abandonReason : null,
    });
  }
  return result.length === 0 ? null : result;
}

/**
 * Analyse IA structurée des fiches disponibles après un message visiteur.
 * Retourne null en cas d'échec (l'appelant applique alors le repli principal).
 */
export async function detectFicheInstances(input: {
  ai: AiClient;
  config: ChatbotConfig;
  messages: AiMessage[];
}): Promise<DetectedFicheInstance[] | null> {
  try {
    const raw = await input.ai.complete({
      system: buildFicheDetectionPrompt(input.config),
      messages: [
        ...input.messages,
        {
          role: "user",
          content:
            "Analyse maintenant la conversation et réponds uniquement avec l'objet JSON des instances de fiches.",
        },
      ],
      maxTokens: 1_600,
      reasoning: "disabled",
      structured: true,
    });
    return parseDetectedInstances(parseExtractionJson(raw), input.config);
  } catch {
    return null;
  }
}

/**
 * Applique le résultat de détection : crée/met à jour les instances, conserve
 * les données existantes, puis garantit une seule instance active.
 */
export async function applyFicheDetection(input: {
  repo: ConversationFicheInstanceRepository;
  config: ChatbotConfig;
  conversationId: string;
  organizationId: string;
  detected: readonly DetectedFicheInstance[];
}): Promise<ConversationFicheInstance | null> {
  const existing = await input.repo.listByConversation(input.organizationId, input.conversationId);
  const upserted: ConversationFicheInstance[] = [];
  for (const entry of input.detected) {
    const status: FicheInstanceStatus = entry.status === "active" ? "detected" : entry.status;
    const writes: UpsertFicheInstanceInput = {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      configId: input.config.id,
      ficheKey: entry.ficheKey,
      status,
      data: entry.data,
      missingFields: entry.missingFields,
      abandonReason: entry.abandonReason,
    };
    upserted.push(await input.repo.upsert(writes));
  }

  const activeFromDetection = input.detected.find((entry) => entry.status === "active");
  const existingActive = existing.find((instance) => instance.status === "active");
  const existingActiveClosed =
    existingActive !== undefined &&
    input.detected.some(
      (entry) =>
        entry.ficheKey === existingActive.ficheKey &&
        (entry.status === "complete" || entry.status === "abandoned"),
    );
  const candidate =
    (activeFromDetection === undefined
      ? undefined
      : upserted.find((instance) => instance.ficheKey === activeFromDetection.ficheKey)) ??
    (existingActive === undefined || existingActiveClosed ? undefined : existingActive) ??
    upserted.find((instance) => instance.status === "detected" || instance.status === "paused");

  if (candidate === undefined) return null;
  if (candidate.status === "complete" || candidate.status === "abandoned") return candidate;
  return input.repo.activate(input.organizationId, input.conversationId, candidate.id);
}

/**
 * Repli après échec d'analyse : la fiche principale redevient active sans
 * toucher aux données déjà enregistrées.
 */
export async function fallbackToPrimaryFiche(input: {
  repo: ConversationFicheInstanceRepository;
  config: ChatbotConfig;
  conversationId: string;
  organizationId: string;
}): Promise<ConversationFicheInstance | null> {
  return ensurePrimaryFicheActive(
    input.repo,
    input.config,
    input.conversationId,
    input.organizationId,
  );
}
