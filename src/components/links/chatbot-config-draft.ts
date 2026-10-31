import type { FileFieldConstraints } from "@/domain/entities/attachment";
import type {
  TemplateField,
  TemplateFieldType,
  TemplateRequiredIf,
} from "@/domain/entities/chat-template";
import {
  buildGuidedChatbotPrompt,
  type ChatbotBehaviorMode,
  type ChatbotDataSelection,
  type ChatbotFallback,
  DEFAULT_CHATBOT_BEHAVIOR_MODE,
  defaultChatbotDataSelection,
  defaultChatbotFallback,
  isChatbotBehaviorMode,
  parseChatbotDataSelection,
  parseChatbotFallback,
} from "@/domain/entities/chatbot-config";
import type { TemplateAiDraft } from "@/domain/template-ai-draft";
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
  /** Règle conditionnelle conservée lors d'un import/édition. */
  requiredIf?: TemplateRequiredIf;
  /** Contraintes fichier conservées lors d'un import/édition. */
  file?: FileFieldConstraints;
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
  /** Fiche réutilisable d'origine (traçabilité du snapshot, optionnel). */
  sourceFicheId?: string;
  sourceVersion?: number;
};

export type ChatbotConfigDraft = {
  behaviorMode: ChatbotBehaviorMode;
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
  fallback: ChatbotFallback;
};

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Math.random().toString(36).slice(2)}`;
}

/** Convertit un brouillon IA de modèle en configuration de chatbot éditable. */
export function chatbotConfigDraftFromAi(draft: TemplateAiDraft): ChatbotConfigDraft {
  const fields: FicheFieldDraft[] = draft.fields.map((field) => ({
    id: newId(),
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required,
    options: field.options?.join(", ") ?? "",
    example: field.example ?? "",
    ...(field.requiredIf === undefined ? {} : { requiredIf: field.requiredIf }),
    ...(field.file === undefined ? {} : { file: field.file }),
  }));
  const fiches: FicheDraft[] =
    fields.length === 0
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
    behaviorMode: "guided",
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
    dataSelection: defaultChatbotDataSelection(),
    fallback:
      fields.length === 0 ? { ...draft.fallback, showCollectionForm: false } : draft.fallback,
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
      },
    ],
  };
}

export function defaultChatbotConfigDraft(): ChatbotConfigDraft {
  return {
    behaviorMode: DEFAULT_CHATBOT_BEHAVIOR_MODE,
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
    fallback: defaultChatbotFallback(),
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
    type: field.type,
    required: field.required,
    ...(options.length === 0 ? {} : { options }),
    ...(field.example.trim() === "" ? {} : { example: field.example.trim() }),
    ...(field.requiredIf === undefined ? {} : { requiredIf: field.requiredIf }),
    ...(field.file === undefined ? {} : { file: field.file }),
  };
}

/** Convertit le brouillon d'éditeur en payload API `config`. */
export function chatbotConfigPayload(draft: ChatbotConfigDraft): Record<string, unknown> {
  return {
    behaviorMode: draft.behaviorMode,
    systemPrompt: effectiveSystemPrompt(draft),
    simple: draftSimpleSettings(draft.simple),
    fiches: draft.fiches.map((fiche) => {
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
        renderTemplate,
        instructions: fiche.instructions.trim(),
        ...(fiche.sourceFicheId === undefined
          ? {}
          : { sourceFicheId: fiche.sourceFicheId, sourceVersion: fiche.sourceVersion ?? null }),
      };
    }),
    dataSelection: draft.dataSelection,
    fallback: draft.fallback,
  };
}

/** Charge une configuration API existante dans le brouillon d'éditeur. */
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
  const fiches: FicheDraft[] = fichesRaw.map((entry, index) => {
    const fiche =
      entry !== null && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
    const fieldsRaw = Array.isArray(fiche.fields) ? fiche.fields : [];
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
      ...(typeof fiche.sourceFicheId === "string" && fiche.sourceFicheId !== ""
        ? {
            sourceFicheId: fiche.sourceFicheId,
            ...(typeof fiche.sourceVersion === "number"
              ? { sourceVersion: fiche.sourceVersion }
              : {}),
          }
        : {}),
    };
  });
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
  return {
    behaviorMode: isChatbotBehaviorMode(raw.behaviorMode)
      ? raw.behaviorMode
      : DEFAULT_CHATBOT_BEHAVIOR_MODE,
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
    fallback: fallback.ok ? fallback.value : defaultChatbotFallback(),
  };
}

/** Fiche réutilisable (API) → brouillon d'éditeur, avec traçabilité snapshot. */
export function draftFromFicheCollecte(input: {
  id: string;
  key: string;
  label: string;
  description: string;
  intent: string;
  instructions: string;
  renderTemplate: string;
  version: number;
  fields: TemplateField[];
}): FicheDraft {
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
    fields: input.fields.map((field) => ({
      id: newId(),
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options?.join(", ") ?? "",
      example: field.example ?? "",
      ...(field.requiredIf === undefined ? {} : { requiredIf: field.requiredIf }),
      ...(field.file === undefined ? {} : { file: field.file }),
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
    }));
}
