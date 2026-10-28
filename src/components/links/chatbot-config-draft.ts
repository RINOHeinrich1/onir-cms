import type { FileFieldConstraints } from "@/domain/entities/attachment";
import type {
  TemplateField,
  TemplateFieldType,
  TemplateRequiredIf,
} from "@/domain/entities/chat-template";

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
  systemPrompt: string;
  simple: {
    role: string;
    objective: string;
    languageMode: "auto" | "fixed";
    languageValue: string;
    tone: string;
    guardrails: string;
    extraInstructions: string;
  };
  fiches: FicheDraft[];
};

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Math.random().toString(36).slice(2)}`;
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
    systemPrompt:
      "Tu es un assistant commercial. Tu accueilles le visiteur, réponds à ses questions et collectes les informations utiles pour préparer une fiche.",
    simple: {
      role: "assistant commercial",
      objective: "Comprendre le besoin du visiteur et collecter les informations nécessaires.",
      languageMode: "auto",
      languageValue: "",
      tone: "professionnel et chaleureux",
      guardrails: "",
      extraInstructions: "",
    },
    fiches: [emptyFiche(0)],
  };
}

function fieldPayload(field: FicheFieldDraft): Record<string, unknown> {
  const options = field.options
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return {
    name: field.name.trim(),
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
    systemPrompt: draft.systemPrompt.trim(),
    simple: {
      role: draft.simple.role.trim(),
      objective: draft.simple.objective.trim(),
      language:
        draft.simple.languageMode === "fixed"
          ? { mode: "fixed", value: draft.simple.languageValue.trim() }
          : { mode: "auto" },
      tone: draft.simple.tone.trim(),
      guardrails: draft.simple.guardrails
        .split("\n")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== ""),
      extraInstructions: draft.simple.extraInstructions.trim(),
    },
    fiches: draft.fiches.map((fiche) => ({
      key: fiche.key.trim(),
      label: fiche.label.trim(),
      description: fiche.description.trim(),
      intent: fiche.intent.trim(),
      fields: fiche.fields
        .filter((field) => field.name.trim() !== "" && field.label.trim() !== "")
        .map(fieldPayload),
      renderTemplate: fiche.renderTemplate,
      instructions: fiche.instructions.trim(),
      ...(fiche.sourceFicheId === undefined
        ? {}
        : { sourceFicheId: fiche.sourceFicheId, sourceVersion: fiche.sourceVersion ?? null }),
    })),
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
    ? simpleRaw.guardrails.filter((entry): entry is string => typeof entry === "string").join("\n")
    : "";
  return {
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
    fiches: fiches.length === 0 ? [emptyFiche(0)] : fiches,
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
