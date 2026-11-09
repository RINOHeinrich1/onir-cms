import type { ChatbotAiDraft } from "@/domain/chatbot-ai-draft";
import type { FileFieldConstraints } from "@/domain/entities/attachment";
import type { ChatLinkSources } from "@/domain/entities/chat";
import type {
  TemplateField,
  TemplateFieldType,
  TemplateRequiredIf,
} from "@/domain/entities/chat-template";
import {
  buildGuidedChatbotPrompt,
  type ChatbotBehaviorMode,
  type ChatbotCollectionMode,
  type ChatbotDataSelection,
  type ChatbotFallback,
  DEFAULT_CHATBOT_BEHAVIOR_MODE,
  DEFAULT_CHATBOT_COLLECTION_MODE,
  DEFAULT_CHATBOT_REPLY_MAX_TOKENS,
  defaultChatbotDataSelection,
  defaultChatbotFallback,
  isChatbotBehaviorMode,
  isChatbotCollectionMode,
  parseChatbotDataSelection,
  parseChatbotFallback,
  parseChatbotReplyMaxTokens,
} from "@/domain/entities/chatbot-config";
import {
  type ChatbotInformationSources,
  type ChatbotMission,
  defaultChatbotInformationSources,
  isChatbotMission,
  parseChatbotInformationSources,
} from "@/domain/entities/chatbot-information";
import { type FicheStatusDefinition, parseFicheStatuses } from "@/domain/entities/fiche-status";
import type { FicheSearchToolConfig } from "@/domain/fiche-search-tool";
import { defaultSearchToolConfig, parseSearchToolConfig } from "@/domain/fiche-search-tool-config";
import { toTemplateKey } from "@/domain/template-defaults";
import type { TemplateSimpleSettings } from "@/domain/template-settings";

export type FicheFieldDraft = {
  /** Identifiant d'édition stable (jamais envoyé au serveur). */
  id: string;
  name: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  options: string;
  example: string;
  unit: string;
  /** Règle conditionnelle conservée lors d'un import/édition. */
  requiredIf?: TemplateRequiredIf;
  /** Contraintes fichier conservées lors d'un import/édition. */
  file?: FileFieldConstraints;
  /** Fiche modèle d'un champ `fiche` ou `tableau_de_fiches`. */
  ficheKey?: string;
};

export type FicheDraft = {
  /** Identifiant d'édition stable (jamais envoyé au serveur). */
  id: string;
  key: string;
  label: string;
  description: string;
  intent: string;
  instructions: string;
  renderTemplate: string;
  fields: FicheFieldDraft[];
  /** Statuts de qualification versionnés avec la fiche (ADR-0067 §2.2). */
  statuses?: FicheStatusDefinition[];
  /** Schémas enfants embarqués dans le snapshot (ADR-0083). */
  subFiches?: FicheDraft[];
  /** Fiche réutilisable d'origine (traçabilité du snapshot, optionnel). */
  sourceFicheId?: string;
  sourceVersion?: number;
};

/**
 * Politiques de l'outil de recherche éditées dans le backoffice (ADR-0067 §4.9).
 * Alias explicite du contrat domaine, pour que l'UI ne dépende pas du nom interne.
 */
export type ChatbotSearchToolDraft = FicheSearchToolConfig;

export function defaultChatbotSearchToolDraft(): ChatbotSearchToolDraft {
  return defaultSearchToolConfig();
}

export type ChatbotConfigDraft = {
  /** Mission stable du chatbot (ADR-0068). */
  mission: ChatbotMission;
  behaviorMode: ChatbotBehaviorMode;
  collectionMode: ChatbotCollectionMode;
  systemPrompt: string;
  simple: {
    role: string;
    objective: string;
    languageMode: "auto" | "fixed";
    languageValue: string;
    tone: string;
    guardrails: string[];
    extraInstructions: string;
  };
  fiches: FicheDraft[];
  dataSelection: ChatbotDataSelection;
  /** Sélection indépendante des médias (Photos/Liens). */
  mediaSelection: ChatbotDataSelection;
  fallback: ChatbotFallback;
  /** Configuration versionnée de l'outil de recherche de fiches (ADR-0067). */
  searchTool: ChatbotSearchToolDraft;
  /** Déclencheur métier de la source Fiches (libellé généré côté serveur). */
  ficheUsageHint: string;
  /** Budget de génération d'une réponse, en tokens. */
  replyMaxTokens: number;
};

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Math.random().toString(36).slice(2)}`;
}

export type ChatbotConfigDraftFromAiOptions = {
  mission?: ChatbotMission;
  dataSelection?: ChatbotDataSelection;
};

/** Convertit un brouillon IA de chatbot en configuration éditable (fiches actuelles). */
export function chatbotConfigDraftFromAi(
  draft: ChatbotAiDraft,
  options: ChatbotConfigDraftFromAiOptions = {},
): ChatbotConfigDraft {
  const mission = options.mission ?? (draft.fields.length > 0 ? "hybrid" : "inform");
  const fields: FicheFieldDraft[] = draft.fields.map((field) => ({
    id: newId(),
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required,
    options: field.options?.join(", ") ?? "",
    example: field.example ?? "",
    unit: "",
    ...(field.requiredIf === undefined ? {} : { requiredIf: field.requiredIf }),
    ...(field.file === undefined ? {} : { file: field.file }),
  }));
  const fiches: FicheDraft[] =
    fields.length === 0 || mission === "inform"
      ? []
      : [
          {
            id: newId(),
            key: toTemplateKey(draft.label),
            label: draft.label,
            description: draft.description,
            intent: draft.objective,
            instructions: draft.extraInstructions,
            renderTemplate: draft.renderTemplate,
            fields,
          },
        ];
  return {
    mission,
    behaviorMode: "guided",
    collectionMode: DEFAULT_CHATBOT_COLLECTION_MODE,
    systemPrompt: draft.systemPrompt,
    simple: {
      role: draft.role,
      objective: draft.objective,
      languageMode: draft.language.mode === "fixed" ? "fixed" : "auto",
      languageValue:
        draft.language.mode === "fixed" && typeof draft.language.value === "string"
          ? draft.language.value
          : "",
      tone: draft.tone,
      guardrails: [...draft.guardrails],
      extraInstructions: draft.extraInstructions,
    },
    fiches,
    dataSelection: options.dataSelection ?? {
      mode: "selected",
      connaissanceIds: [],
      mediaIds: [],
    },
    mediaSelection: { mode: "selected", connaissanceIds: [], mediaIds: [] },
    fallback:
      fiches.length === 0 ? { ...draft.fallback, showCollectionForm: false } : draft.fallback,
    searchTool: defaultChatbotSearchToolDraft(),
    ficheUsageHint: defaultChatbotInformationSources().fiches.usageHint,
    replyMaxTokens: DEFAULT_CHATBOT_REPLY_MAX_TOKENS,
  };
}

export function emptyField(): FicheFieldDraft {
  return {
    id: newId(),
    name: "",
    label: "",
    type: "text",
    required: false,
    options: "",
    example: "",
    unit: "",
  };
}

export function emptyFiche(index: number): FicheDraft {
  return {
    id: newId(),
    key: index === 0 ? "fiche-principale" : "",
    label: index === 0 ? "Fiche principale" : "",
    description: "",
    intent: "",
    instructions: "",
    renderTemplate: "# {{contact}}\n",
    fields: [
      {
        id: newId(),
        name: "contact",
        label: "Contact",
        type: "text",
        required: true,
        options: "",
        example: "Nom et coordonnées",
        unit: "",
      },
    ],
  };
}

export function defaultChatbotConfigDraft(): ChatbotConfigDraft {
  return {
    mission: "inform",
    behaviorMode: DEFAULT_CHATBOT_BEHAVIOR_MODE,
    collectionMode: DEFAULT_CHATBOT_COLLECTION_MODE,
    systemPrompt: "",
    simple: {
      role: "assistant commercial",
      objective: "Comprendre le besoin du visiteur et collecter les informations nécessaires.",
      languageMode: "auto",
      languageValue: "",
      tone: "professionnel et chaleureux",
      guardrails: [],
      extraInstructions: "",
    },
    fiches: [],
    dataSelection: defaultChatbotDataSelection(),
    mediaSelection: defaultChatbotDataSelection(),
    fallback: defaultChatbotFallback(),
    searchTool: defaultChatbotSearchToolDraft(),
    ficheUsageHint: defaultChatbotInformationSources().fiches.usageHint,
    replyMaxTokens: DEFAULT_CHATBOT_REPLY_MAX_TOKENS,
  };
}

/** Réglages du brouillon → bloc simple du domaine. */
export function draftSimpleSettings(simple: ChatbotConfigDraft["simple"]): TemplateSimpleSettings {
  return {
    role: simple.role.trim(),
    objective: simple.objective.trim(),
    language:
      simple.languageMode === "fixed"
        ? { mode: "fixed", value: simple.languageValue.trim() }
        : { mode: "auto" },
    tone: simple.tone.trim(),
    guardrails: simple.guardrails.map((entry) => entry.trim()).filter((entry) => entry !== ""),
    extraInstructions: simple.extraInstructions.trim(),
  };
}

/** Prompt généré en mode guidé (aperçu en lecture seule). */
export function guidedPromptFromDraft(draft: ChatbotConfigDraft): string {
  return buildGuidedChatbotPrompt(draftSimpleSettings(draft.simple));
}

/** Prompt effectif envoyé au serveur : généré en guidé, saisi en expert. */
export function effectiveSystemPrompt(draft: ChatbotConfigDraft): string {
  return draft.behaviorMode === "expert" ? draft.systemPrompt.trim() : guidedPromptFromDraft(draft);
}

function fieldNameFromLabel(label: string): string {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized === "" ? "champ" : normalized;
}

function fieldPayload(field: FicheFieldDraft, name: string): Record<string, unknown> {
  const options = field.options
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return {
    name,
    label: field.label.trim(),
    type:
      (field.type === "select" || field.type === "multi") && options.length === 0
        ? "text"
        : field.type,
    required: field.required,
    ...((field.type === "select" || field.type === "multi") && options.length > 0
      ? { options }
      : {}),
    ...(field.example.trim() === "" ? {} : { example: field.example.trim() }),
    ...(field.type === "number" && field.unit.trim() !== "" ? { unit: field.unit.trim() } : {}),
    ...(field.requiredIf === undefined ? {} : { requiredIf: field.requiredIf }),
    ...(field.file === undefined ? {} : { file: field.file }),
    ...(field.ficheKey === undefined || field.ficheKey.trim() === ""
      ? {}
      : { ficheKey: field.ficheKey.trim() }),
  };
}

/** Convertit le brouillon d'éditeur en payload API `config`. */
export type ChatbotConfigPayloadOptions = {
  /** Le lien porte au moins un canal public : aucune politique backoffice. */
  publicLink?: boolean;
  /** Sources de lien (compatibilité B/C) utilisées pour construire les sources versionnées. */
  sources?: ChatLinkSources;
};

function informationSourcesFromDraft(
  draft: ChatbotConfigDraft,
  sources: ChatLinkSources,
  publicLink: boolean,
): ChatbotInformationSources {
  const defaults = defaultChatbotInformationSources();
  const searchTool = publicSafeSearchToolDraft(draft.searchTool, publicLink);
  return {
    fiches: {
      ...searchTool,
      enabled: draft.mission !== "collect" && searchTool.enabled,
      label: defaults.fiches.label,
      usageHint: draft.ficheUsageHint,
      matchMode: "normalized",
    },
    connaissances: {
      ...defaults.connaissances,
      enabled: draft.mission !== "collect" && sources.connaissances,
      selection: {
        mode: draft.dataSelection.mode,
        ids: draft.dataSelection.connaissanceIds,
      },
    },
    medias: {
      ...defaults.medias,
      enabled: draft.mission !== "collect" && (sources.phototheque || sources.lien),
      types: [
        ...(sources.phototheque ? (["photo"] as const) : []),
        ...(sources.lien ? (["lien"] as const) : []),
      ],
      selection: {
        mode: draft.mediaSelection.mode,
        ids: draft.mediaSelection.mediaIds,
      },
    },
  };
}

/**
 * Motifs de refus d'une configuration d'outil sur un lien public.
 * Mêmes règles que la garde serveur (ADR-0067 §2.5 / §10).
 */
export function searchToolDraftViolations(
  searchTool: ChatbotSearchToolDraft,
  publicLink: boolean,
): string[] {
  if (!searchTool.enabled) return [];
  const errors: string[] = [];
  if (searchTool.ficheTypes.length === 0) {
    errors.push("Sélectionnez au moins une fiche de collecte à interroger");
  }
  if (publicLink && searchTool.statusMode !== "hidden_fixed") {
    errors.push("Le mode de statut backoffice est interdit sur un lien public");
  }
  return errors;
}

/**
 * Normalise la politique pour un lien public : même une valeur héritée
 * invalide ne peut jamais être émise vers le serveur.
 */
export function publicSafeSearchToolDraft(
  searchTool: ChatbotSearchToolDraft,
  publicLink: boolean,
): ChatbotSearchToolDraft {
  if (!publicLink) return { ...searchTool };
  return {
    ...searchTool,
    statusMode: "hidden_fixed",
  };
}

function serializeSubFiche(fiche: FicheDraft): Record<string, unknown> {
  const used = new Set<string>();
  const fields = fiche.fields
    .filter((field) => field.label.trim() !== "")
    .map((field) => {
      const base = field.name.trim() === "" ? fieldNameFromLabel(field.label) : field.name.trim();
      let name = base;
      let suffix = 2;
      while (used.has(name)) {
        name = `${base}_${suffix}`;
        suffix += 1;
      }
      used.add(name);
      return { draft: field, name };
    });
  return {
    key: fiche.key.trim(),
    label: fiche.label.trim(),
    description: fiche.description.trim(),
    intent: fiche.intent.trim(),
    fields: fields.map(({ draft: field, name }) => fieldPayload(field, name)),
    renderTemplate:
      `# ${fiche.label.trim() === "" ? "Sous-fiche" : fiche.label.trim()}\n\n` +
      fields
        .map(({ draft: field, name }) => `- **${field.label.trim()}** : {{${name}}}`)
        .join("\n") +
      "\n",
    instructions: fiche.instructions.trim(),
    ...(fiche.statuses === undefined ? {} : { statuses: fiche.statuses }),
    ...(fiche.subFiches === undefined ? {} : { subFiches: fiche.subFiches.map(serializeSubFiche) }),
  };
}

export function chatbotConfigPayload(
  draft: ChatbotConfigDraft,
  options: ChatbotConfigPayloadOptions = {},
): Record<string, unknown> {
  const publicLink = options.publicLink === true;
  const linkSources = options.sources ?? { connaissances: true, phototheque: true, lien: true };
  const informationSources = informationSourcesFromDraft(draft, linkSources, publicLink);
  return {
    mission: draft.mission,
    informationSources,
    behaviorMode: draft.behaviorMode,
    collectionMode: draft.collectionMode,
    systemPrompt: effectiveSystemPrompt(draft),
    simple: draftSimpleSettings(draft.simple),
    fiches: (draft.mission === "inform" ? [] : draft.fiches).map((fiche) => {
      const used = new Set<string>();
      const fields = fiche.fields
        .filter((field) => field.label.trim() !== "")
        .map((field) => {
          const base =
            field.name.trim() === "" ? fieldNameFromLabel(field.label) : field.name.trim();
          let name = base;
          let suffix = 2;
          while (used.has(name)) {
            name = `${base}_${suffix}`;
            suffix += 1;
          }
          used.add(name);
          return { draft: field, name };
        });
      const renderTemplate =
        `# ${fiche.label.trim() === "" ? "Fiche de collecte" : fiche.label.trim()}\n\n` +
        (fields.length === 0
          ? ""
          : fields
              .map(({ draft: field, name }) => `- **${field.label.trim()}** : {{${name}}}`)
              .join("\n")) +
        "\n";
      return {
        key: fiche.key.trim(),
        label: fiche.label.trim(),
        description: fiche.description.trim(),
        intent: fiche.intent.trim(),
        fields: fields.map(({ draft: field, name }) => fieldPayload(field, name)),
        ...(fiche.statuses === undefined ? {} : { statuses: fiche.statuses }),
        ...(fiche.subFiches === undefined
          ? {}
          : { subFiches: fiche.subFiches.map(serializeSubFiche) }),
        renderTemplate,
        instructions: fiche.instructions.trim(),
        ...(fiche.sourceFicheId === undefined
          ? {}
          : { sourceFicheId: fiche.sourceFicheId, sourceVersion: fiche.sourceVersion ?? null }),
      };
    }),
    dataSelection: draft.dataSelection,
    fallback: draft.fallback,
    searchTool: publicSafeSearchToolDraft(draft.searchTool, publicLink),
    replyMaxTokens: draft.replyMaxTokens,
  };
}

/** Charge une configuration API existante dans le brouillon d'éditeur. */
function ficheDraftFromRaw(entry: unknown, index: number, depth = 0): FicheDraft {
  const fiche =
    entry !== null && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)
      : {};
  const fieldsRaw = Array.isArray(fiche.fields) ? fiche.fields : [];
  const statusesParsed = parseFicheStatuses(fiche.statuses);
  const fields: FicheFieldDraft[] = fieldsRaw.map((fieldEntry) => {
    const field =
      fieldEntry !== null && typeof fieldEntry === "object" && !Array.isArray(fieldEntry)
        ? (fieldEntry as Record<string, unknown>)
        : {};
    return {
      id: newId(),
      name: typeof field.name === "string" ? field.name : "",
      label: typeof field.label === "string" ? field.label : "",
      type: (typeof field.type === "string" ? field.type : "text") as TemplateFieldType,
      required: field.required === true,
      options: Array.isArray(field.options)
        ? field.options.filter((item): item is string => typeof item === "string").join(", ")
        : "",
      example: typeof field.example === "string" ? field.example : "",
      unit: typeof field.unit === "string" ? field.unit : "",
      ...(field.requiredIf !== null &&
      typeof field.requiredIf === "object" &&
      !Array.isArray(field.requiredIf) &&
      typeof (field.requiredIf as Record<string, unknown>).field === "string" &&
      typeof (field.requiredIf as Record<string, unknown>).equals === "string"
        ? {
            requiredIf: {
              field: (field.requiredIf as Record<string, unknown>).field as string,
              equals: (field.requiredIf as Record<string, unknown>).equals as string,
            },
          }
        : {}),
      ...(field.file !== null && typeof field.file === "object" && !Array.isArray(field.file)
        ? { file: field.file as FileFieldConstraints }
        : {}),
      ...(typeof field.ficheKey === "string" && field.ficheKey.trim() !== ""
        ? { ficheKey: field.ficheKey.trim() }
        : {}),
    };
  });
  return {
    id: newId(),
    key: typeof fiche.key === "string" ? fiche.key : `fiche-${index + 1}`,
    label: typeof fiche.label === "string" ? fiche.label : "",
    description: typeof fiche.description === "string" ? fiche.description : "",
    intent: typeof fiche.intent === "string" ? fiche.intent : "",
    instructions: typeof fiche.instructions === "string" ? fiche.instructions : "",
    renderTemplate:
      typeof fiche.renderTemplate === "string" && fiche.renderTemplate.trim() !== ""
        ? fiche.renderTemplate
        : "# {{contact}}\n",
    fields: fields.length === 0 ? [emptyField()] : fields,
    ...(statusesParsed.ok && statusesParsed.value.length > 0
      ? { statuses: statusesParsed.value }
      : {}),
    ...(Array.isArray(fiche.subFiches) && depth < 3
      ? {
          subFiches: fiche.subFiches.map((subEntry, subIndex) =>
            ficheDraftFromRaw(subEntry, subIndex, depth + 1),
          ),
        }
      : {}),
    ...(typeof fiche.sourceFicheId === "string" && fiche.sourceFicheId !== ""
      ? {
          sourceFicheId: fiche.sourceFicheId,
          ...(typeof fiche.sourceVersion === "number"
            ? { sourceVersion: fiche.sourceVersion }
            : {}),
        }
      : {}),
  };
}

export function draftFromConfig(input: unknown): ChatbotConfigDraft | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const simpleRaw =
    raw.simple !== null && typeof raw.simple === "object" && !Array.isArray(raw.simple)
      ? (raw.simple as Record<string, unknown>)
      : {};
  const language =
    simpleRaw.language !== null &&
    typeof simpleRaw.language === "object" &&
    !Array.isArray(simpleRaw.language)
      ? (simpleRaw.language as Record<string, unknown>)
      : {};
  const fichesRaw = Array.isArray(raw.fiches) ? raw.fiches : [];
  const fiches: FicheDraft[] = fichesRaw.map((entry, index) => ficheDraftFromRaw(entry, index));
  const guardrails = Array.isArray(simpleRaw.guardrails)
    ? simpleRaw.guardrails
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "")
    : typeof simpleRaw.guardrails === "string"
      ? simpleRaw.guardrails
          .split("\n")
          .map((entry) => entry.trim())
          .filter((entry) => entry !== "")
      : [];
  const dataSelection = parseChatbotDataSelection(raw.dataSelection);
  const fallback = parseChatbotFallback(raw.fallback);
  const searchTool = parseSearchToolConfig(raw.searchTool);
  const informationSources = parseChatbotInformationSources(raw.informationSources);
  const mediaSelection = informationSources.ok
    ? {
        mode: informationSources.value.medias.selection.mode,
        connaissanceIds: [],
        mediaIds: informationSources.value.medias.selection.ids,
      }
    : dataSelection.ok
      ? dataSelection.value
      : defaultChatbotDataSelection();
  const ficheUsageHint = informationSources.ok
    ? informationSources.value.fiches.usageHint
    : defaultChatbotInformationSources().fiches.usageHint;
  const mission: ChatbotMission = isChatbotMission(raw.mission)
    ? raw.mission
    : searchTool.ok && searchTool.value.enabled
      ? "hybrid"
      : "collect";
  return {
    mission,
    behaviorMode: isChatbotBehaviorMode(raw.behaviorMode)
      ? raw.behaviorMode
      : DEFAULT_CHATBOT_BEHAVIOR_MODE,
    collectionMode: isChatbotCollectionMode(raw.collectionMode)
      ? raw.collectionMode
      : DEFAULT_CHATBOT_COLLECTION_MODE,
    systemPrompt: typeof raw.systemPrompt === "string" ? raw.systemPrompt : "",
    simple: {
      role: typeof simpleRaw.role === "string" ? simpleRaw.role : "",
      objective: typeof simpleRaw.objective === "string" ? simpleRaw.objective : "",
      languageMode: language.mode === "fixed" ? "fixed" : "auto",
      languageValue: typeof language.value === "string" ? language.value : "",
      tone: typeof simpleRaw.tone === "string" ? simpleRaw.tone : "",
      guardrails,
      extraInstructions:
        typeof simpleRaw.extraInstructions === "string" ? simpleRaw.extraInstructions : "",
    },
    fiches,
    dataSelection: dataSelection.ok ? dataSelection.value : defaultChatbotDataSelection(),
    mediaSelection,
    fallback: fallback.ok ? fallback.value : defaultChatbotFallback(),
    searchTool: searchTool.ok ? searchTool.value : defaultChatbotSearchToolDraft(),
    ficheUsageHint,
    replyMaxTokens:
      parseChatbotReplyMaxTokens(raw.replyMaxTokens) ?? DEFAULT_CHATBOT_REPLY_MAX_TOKENS,
  };
}

export type FicheCollecteSource = {
  id: string;
  key: string;
  label: string;
  description: string;
  intent: string;
  instructions: string;
  renderTemplate: string;
  version: number;
  fields: TemplateField[];
  statuses?: FicheStatusDefinition[];
};

function collectSubFiches(
  input: FicheCollecteSource,
  resolve: (key: string) => FicheCollecteSource | undefined,
  seen: Set<string>,
): FicheDraft[] {
  const keys = new Set(
    input.fields
      .filter((field) => field.type === "fiche" || field.type === "tableau_de_fiches")
      .map((field) => field.ficheKey ?? "")
      .filter((key) => key !== ""),
  );
  const result: FicheDraft[] = [];
  for (const key of keys) {
    if (seen.has(key)) continue;
    const child = resolve(key);
    if (child === undefined) continue;
    result.push(draftFromFicheCollecte(child, resolve, new Set(seen).add(key)));
  }
  return result;
}

/** Fiche réutilisable (API) → brouillon d'éditeur, avec traçabilité snapshot. */
export function draftFromFicheCollecte(
  input: FicheCollecteSource,
  resolve: (key: string) => FicheCollecteSource | undefined = () => undefined,
  seen: Set<string> = new Set([input.key]),
): FicheDraft {
  const subFiches = collectSubFiches(input, resolve, seen);
  return {
    id: newId(),
    key: input.key,
    label: input.label,
    description: input.description,
    intent: input.intent,
    instructions: input.instructions,
    renderTemplate: input.renderTemplate.trim() === "" ? "# {{contact}}\n" : input.renderTemplate,
    sourceFicheId: input.id,
    sourceVersion: input.version,
    ...(input.statuses === undefined ? {} : { statuses: input.statuses }),
    ...(subFiches.length === 0 ? {} : { subFiches }),
    fields: input.fields.map((field) => ({
      id: newId(),
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options?.join(", ") ?? "",
      example: field.example ?? "",
      unit: field.unit ?? "",
      ...(field.requiredIf === undefined ? {} : { requiredIf: field.requiredIf }),
      ...(field.file === undefined ? {} : { file: field.file }),
      ...(field.ficheKey === undefined ? {} : { ficheKey: field.ficheKey }),
    })),
  };
}

/** Champs API → `TemplateField[]` (pour l'aperçu / typage). */
export function draftFieldsToTemplateFields(fields: FicheFieldDraft[]): TemplateField[] {
  return fields
    .filter((field) => field.name.trim() !== "" && field.label.trim() !== "")
    .map((field) => ({
      name: field.name.trim(),
      label: field.label.trim(),
      type: field.type,
      required: field.required,
      ...(field.unit.trim() === "" ? {} : { unit: field.unit.trim() }),
      ...(field.ficheKey === undefined || field.ficheKey.trim() === ""
        ? {}
        : { ficheKey: field.ficheKey.trim() }),
    }));
}
