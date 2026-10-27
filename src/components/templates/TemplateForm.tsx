"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_PRESET_LABELS,
  ATTACHMENT_PRESETS,
  type AttachmentMime,
  type AttachmentPreset,
  isAttachmentMime,
  presetAccept,
  presetOfAccept,
} from "@/domain/entities/attachment";
import {
  isTemplateFieldType,
  type TemplateDefinition,
  type TemplateField,
} from "@/domain/entities/chat-template";
import {
  buildDefaultRenderTemplate,
  buildDefaultSystemPrompt,
  PROMPT_GUARDRAILS,
  PROMPT_TONES,
  resolveFieldName,
  toFieldName,
  toTemplateKey,
  uniqueFieldName,
  uniqueTemplateKey,
} from "@/domain/template-defaults";
import {
  normalizeTemplateSimpleSettings,
  type TemplateLanguagePolicy,
  type TemplateSimpleSettings,
} from "@/domain/template-settings";
import type { TemplateAiGenerationDto, TemplateAiKnowledgeDto } from "./ai-types";
import { KnowledgeMergeDialog } from "./KnowledgeMergeDialog";
import { TemplateAiAssistPanel } from "./TemplateAiAssistPanel";
import { TemplateAiReview } from "./TemplateAiReview";
import { TemplateLivePreview } from "./TemplateLivePreview";

function normalizeLanguagePolicyForForm(
  mode: "auto" | "fixed",
  value: string,
): TemplateLanguagePolicy {
  if (mode === "fixed" && value.trim() !== "") {
    return { mode: "fixed", value: value.trim() };
  }
  return { mode: "auto" };
}

import {
  EMPTY_FIELD,
  type TemplateFieldDraft,
  type TemplateFormMode,
  type TemplateSeed,
} from "./types";

type TemplateFormProps = {
  /** Null = création (ou duplication via `seed`) ; sinon nouvelle version. */
  templateKey: string | null;
  seed: TemplateSeed | null;
  existingKeys: string[];
  onSaved: () => void;
  onCancel: () => void;
};

const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Texte court" },
  { value: "textarea", label: "Texte long" },
  { value: "select", label: "Choix unique" },
  { value: "multi", label: "Choix multiple" },
  { value: "url", label: "Lien" },
  { value: "email", label: "Email" },
  { value: "file", label: "Fichier" },
] as const;

type FieldRow = TemplateFieldDraft & { uid: number };

let nextFieldUid = 1;

/** Attribue un identifiant stable à une ligne de champ (clés React). */
function withUid(draft: TemplateFieldDraft): FieldRow {
  const uid = nextFieldUid;
  nextFieldUid += 1;
  return { ...draft, uid };
}

function draftFromApi(field: {
  name?: unknown;
  label?: unknown;
  type?: unknown;
  required?: unknown;
  options?: unknown;
  requiredIf?: unknown;
  example?: unknown;
  file?: unknown;
}): TemplateFieldDraft {
  const requiredIf =
    field.requiredIf !== null &&
    typeof field.requiredIf === "object" &&
    !Array.isArray(field.requiredIf)
      ? (field.requiredIf as Record<string, unknown>)
      : null;
  return {
    name: typeof field.name === "string" ? field.name : "",
    label: typeof field.label === "string" ? field.label : "",
    type: typeof field.type === "string" ? field.type : "text",
    required: field.required === true,
    options: Array.isArray(field.options) ? field.options.join(", ") : "",
    requiredIfField: requiredIf && typeof requiredIf.field === "string" ? requiredIf.field : "",
    requiredIfEquals: requiredIf && typeof requiredIf.equals === "string" ? requiredIf.equals : "",
    example: typeof field.example === "string" ? field.example : "",
    ...fileDraft(field.file),
  };
}

function fileDraft(
  file: unknown,
): Pick<TemplateFieldDraft, "filePreset" | "fileAccept" | "fileMaxFiles" | "fileMaxBytesMo"> {
  if (file === null || typeof file !== "object" || Array.isArray(file)) {
    return { filePreset: "all", fileAccept: "", fileMaxFiles: "1", fileMaxBytesMo: "10" };
  }
  const source = file as Record<string, unknown>;
  const accept = Array.isArray(source.accept)
    ? source.accept.filter((entry): entry is string => typeof entry === "string")
    : [];
  const maxFiles = typeof source.maxFiles === "number" ? source.maxFiles : 1;
  const maxBytes = typeof source.maxBytes === "number" ? source.maxBytes : ATTACHMENT_MAX_BYTES;
  const preset = presetOfAccept(accept);
  const exact =
    accept.length > 0 &&
    accept.length === presetAccept(preset).length &&
    accept.every((entry) => (presetAccept(preset) as string[]).includes(entry));
  return {
    filePreset: exact ? preset : "custom",
    fileAccept: accept.join(", "),
    fileMaxFiles: String(maxFiles),
    fileMaxBytesMo: String(Math.max(1, Math.round(maxBytes / 1024 / 1024))),
  };
}

function FileConstraintsEditor({
  field,
  onChange,
}: {
  field: TemplateFieldDraft;
  onChange: (patch: Partial<TemplateFieldDraft>) => void;
}) {
  return (
    <div className="grid-2">
      <label className="field">
        Fichiers acceptés
        <select
          value={field.filePreset}
          onChange={(event) => onChange({ filePreset: event.target.value })}
        >
          {ATTACHMENT_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {ATTACHMENT_PRESET_LABELS[preset]}
            </option>
          ))}
          <option value="custom">Personnalisé (types MIME)</option>
        </select>
      </label>
      {field.filePreset === "custom" ? (
        <label className="field">
          Types MIME (séparés par des virgules)
          <input
            type="text"
            placeholder="image/jpeg, application/pdf"
            value={field.fileAccept}
            onChange={(event) => onChange({ fileAccept: event.target.value })}
          />
        </label>
      ) : null}
      <label className="field">
        Nombre maximum de fichiers
        <input
          type="number"
          min={1}
          max={ATTACHMENT_MAX_FILES}
          value={field.fileMaxFiles}
          onChange={(event) => onChange({ fileMaxFiles: event.target.value })}
        />
      </label>
      <label className="field">
        Taille maximum par fichier (Mo)
        <input
          type="number"
          min={1}
          max={Math.round(ATTACHMENT_MAX_BYTES / 1024 / 1024)}
          value={field.fileMaxBytesMo}
          onChange={(event) => onChange({ fileMaxBytesMo: event.target.value })}
        />
      </label>
    </div>
  );
}

function fieldsFromDefinition(definition: Record<string, unknown>): FieldRow[] {
  const rawFields = Array.isArray(definition.fields) ? definition.fields : [];
  return rawFields.length > 0
    ? rawFields.map((entry) => withUid(draftFromApi(entry as Record<string, unknown>)))
    : [withUid({ ...EMPTY_FIELD })];
}

function renameTemplateVariables(text: string, oldName: string, newName: string): string {
  if (oldName === "" || newName === "" || oldName === newName) return text;
  return text
    .split(`{{${oldName}}}`)
    .join(`{{${newName}}}`)
    .split(`{{#if ${oldName}}}`)
    .join(`{{#if ${newName}}}`);
}

function splitOptions(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/** Fige les noms techniques dérivés du mode simple avant de passer en expert. */
function materializeSimpleFieldNames(fields: readonly FieldRow[]): FieldRow[] {
  const used: string[] = [];
  return fields.map((field) => {
    if (field.label.trim() === "" && field.name.trim() === "") return field;
    const name = uniqueFieldName(resolveFieldName(field.label, field.name), used);
    used.push(name);
    return { ...field, name };
  });
}

/**
 * Convertit les lignes d'édition en définition validable.
 * Les champs existants conservent leur clé technique (compatibilité) ; les
 * nouveaux champs reçoivent une clé dérivée du libellé.
 */
function fieldsToTemplateFields(
  fields: readonly FieldRow[],
  _mode: TemplateFormMode,
): TemplateField[] {
  const used: string[] = [];
  const result: TemplateField[] = [];

  for (const field of fields) {
    const label = field.label.trim();
    const rawName = field.name.trim();
    if (label === "" && rawName === "") continue;

    const name = uniqueFieldName(rawName !== "" ? rawName : toFieldName(label), used);
    used.push(name);

    const type = isTemplateFieldType(field.type) ? field.type : "text";
    const options = splitOptions(field.options);
    const requiredIf =
      field.requiredIfField.trim() !== "" && field.requiredIfEquals.trim() !== ""
        ? {
            field: field.requiredIfField.trim(),
            equals: field.requiredIfEquals.trim(),
          }
        : undefined;

    const file =
      type === "file"
        ? (() => {
            const preset = ATTACHMENT_PRESETS.includes(field.filePreset as AttachmentPreset)
              ? (field.filePreset as AttachmentPreset)
              : null;
            const accept: AttachmentMime[] =
              preset === null
                ? splitOptions(field.fileAccept).filter(isAttachmentMime)
                : presetAccept(preset);
            const maxFiles = Number(field.fileMaxFiles);
            const maxBytes = Math.round(Number(field.fileMaxBytesMo) * 1024 * 1024);
            return {
              accept,
              maxFiles:
                Number.isInteger(maxFiles) && maxFiles >= 1 && maxFiles <= ATTACHMENT_MAX_FILES
                  ? maxFiles
                  : 1,
              maxBytes:
                Number.isInteger(maxBytes) && maxBytes >= 1 && maxBytes <= ATTACHMENT_MAX_BYTES
                  ? maxBytes
                  : ATTACHMENT_MAX_BYTES,
            };
          })()
        : undefined;

    result.push({
      name,
      label: label === "" ? name : label,
      type,
      required: field.required,
      ...(type === "select" || type === "multi" ? { options } : {}),
      ...(file === undefined ? {} : { file }),
      ...(requiredIf === undefined ? {} : { requiredIf }),
      ...(field.example.trim() === "" ? {} : { example: field.example.trim() }),
    });
  }

  return result;
}

/**
 * Formulaire de création / nouvelle version d'un modèle (US-TEMPLATE-001).
 * Le mode simple génère le prompt et la fiche à partir des réglages et des
 * informations à collecter. Le mode expert conserve toutes les possibilités
 * techniques (clé, prompt brut, Markdown, types et conditions).
 */
export function TemplateForm({
  templateKey,
  seed,
  existingKeys,
  onSaved,
  onCancel,
}: TemplateFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  useToastOnMessage(error);
  const [mode, setMode] = useState<TemplateFormMode>(
    templateKey === null && seed === null ? "simple" : "expert",
  );
  const [key, setKey] = useState(templateKey ?? seed?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(false);
  const initialSimple =
    seed === null ? null : normalizeTemplateSimpleSettings(seed.definition.simple);
  const [label, setLabel] = useState(seed?.label ?? "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(() =>
    typeof seed?.definition.systemPrompt === "string" ? seed.definition.systemPrompt : "",
  );
  const [renderTemplateText, setRenderTemplateText] = useState(() =>
    typeof seed?.definition.renderTemplate === "string" ? seed.definition.renderTemplate : "",
  );
  const [role, setRole] = useState(initialSimple?.role ?? "");
  const [objective, setObjective] = useState(initialSimple?.objective ?? seed?.description ?? "");
  const [languageMode, setLanguageMode] = useState<"auto" | "fixed">(
    initialSimple?.language.mode ?? "auto",
  );
  const [languageValue, setLanguageValue] = useState(
    initialSimple?.language.mode === "fixed" ? initialSimple.language.value : "",
  );
  const [tone, setTone] = useState(initialSimple?.tone ?? "");
  const [guardrails, setGuardrails] = useState<string[]>(initialSimple?.guardrails ?? []);
  const [extraInstructions, setExtraInstructions] = useState(
    initialSimple?.extraInstructions ?? "",
  );
  const [customGuardrail, setCustomGuardrail] = useState("");
  const [hasSimpleSettings, setHasSimpleSettings] = useState(initialSimple !== null);
  const [definitionLoaded, setDefinitionLoaded] = useState(templateKey === null);
  const [fields, setFields] = useState<FieldRow[]>(() =>
    seed === null ? [withUid({ ...EMPTY_FIELD })] : fieldsFromDefinition(seed.definition),
  );
  const [aiAssist, setAiAssist] = useState(false);
  const [aiGeneration, setAiGeneration] = useState<TemplateAiGenerationDto | null>(null);
  const [aiKnowledge, setAiKnowledge] = useState<TemplateAiKnowledgeDto[]>([]);
  const [aiMergeOpen, setAiMergeOpen] = useState(false);
  const [aiMergePolicy, setAiMergePolicy] = useState<"append" | "replace" | null>(null);

  useEffect(() => {
    if (templateKey === null) return;
    let cancelled = false;
    fetch(`/api/templates/${templateKey}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Chargement impossible");
        const json = (await response.json()) as {
          template: { key: string; label: string; description: string };
          versions: Array<{ definition: Record<string, unknown> }>;
        };
        if (cancelled) return;
        const definition = json.versions[json.versions.length - 1]?.definition;
        if (definition === undefined) throw new Error("Version introuvable");
        setKey(json.template.key);
        setKeyTouched(true);
        setLabel(json.template.label);
        setDescription(json.template.description);
        const simple = normalizeTemplateSimpleSettings(definition.simple);
        setHasSimpleSettings(simple !== null);
        if (simple !== null) {
          setRole(simple.role);
          setObjective(simple.objective);
          setLanguageMode(simple.language.mode);
          setLanguageValue(simple.language.mode === "fixed" ? simple.language.value : "");
          setTone(simple.tone);
          setGuardrails(simple.guardrails);
          setExtraInstructions(simple.extraInstructions);
        } else {
          setRole("");
          setObjective(json.template.description);
          setLanguageMode("auto");
          setLanguageValue("");
          setTone("");
          setGuardrails([]);
          setExtraInstructions("");
        }
        setSystemPrompt(typeof definition.systemPrompt === "string" ? definition.systemPrompt : "");
        setRenderTemplateText(
          typeof definition.renderTemplate === "string" ? definition.renderTemplate : "",
        );
        setFields(fieldsFromDefinition(definition));
        setDefinitionLoaded(true);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setDefinitionLoaded(true);
        setError(cause instanceof Error ? cause.message : "Chargement impossible");
      });
    return () => {
      cancelled = true;
    };
  }, [templateKey]);

  const preparedFields = useMemo(() => fieldsToTemplateFields(fields, mode), [fields, mode]);
  const languagePolicy = useMemo<TemplateLanguagePolicy>(
    () => normalizeLanguagePolicyForForm(languageMode, languageValue),
    [languageMode, languageValue],
  );
  const simpleSettings = useMemo<TemplateSimpleSettings>(
    () => ({
      role: role.trim(),
      objective: objective.trim(),
      language: languagePolicy,
      tone: tone.trim(),
      guardrails: [...guardrails],
      extraInstructions: extraInstructions.trim(),
    }),
    [role, objective, languagePolicy, tone, guardrails, extraInstructions],
  );
  const generatedPrompt = useMemo(
    () =>
      buildDefaultSystemPrompt({
        role,
        objective,
        language: languagePolicy,
        tone,
        guardrails,
        extraInstructions,
        fields: preparedFields,
      }),
    [role, objective, languagePolicy, tone, guardrails, extraInstructions, preparedFields],
  );
  const generatedRender = useMemo(
    () => buildDefaultRenderTemplate(label, preparedFields),
    [label, preparedFields],
  );
  const effectivePrompt = mode === "simple" ? generatedPrompt : systemPrompt;
  const effectiveRender = mode === "simple" ? generatedRender : renderTemplateText;

  const previewDefinition = useMemo<TemplateDefinition>(
    () => ({
      key: templateKey ?? (key.trim() === "" ? "apercu" : key.trim()),
      label: label.trim() === "" ? "Nouveau modèle" : label.trim(),
      description,
      systemPrompt: effectivePrompt,
      fields: preparedFields,
      renderTemplate: effectiveRender,
      ...(mode === "simple" ? { simple: simpleSettings } : {}),
    }),
    [
      templateKey,
      key,
      label,
      description,
      effectivePrompt,
      preparedFields,
      effectiveRender,
      mode,
      simpleSettings,
    ],
  );

  const updateField = (uid: number, patch: Partial<TemplateFieldDraft>): void => {
    setFields((previous) =>
      previous.map((entry) => (entry.uid === uid ? { ...entry, ...patch } : entry)),
    );
  };

  const updateFieldLabel = (uid: number, value: string): void => {
    const current = fields.find((entry) => entry.uid === uid);
    if (current === undefined) return;
    const used = fields
      .filter((other) => other.uid !== uid && other.name.trim() !== "")
      .map((other) => other.name);
    const newName = value.trim() === "" ? "" : uniqueFieldName(toFieldName(value), used);
    setFields((previous) =>
      previous.map((entry) => {
        if (entry.uid === uid) return { ...entry, label: value, name: newName };
        if (current.name !== "" && entry.requiredIfField === current.name) {
          return { ...entry, requiredIfField: newName };
        }
        return entry;
      }),
    );
    if (current.name !== newName) {
      setSystemPrompt((previous) => renameTemplateVariables(previous, current.name, newName));
      setRenderTemplateText((previous) => renameTemplateVariables(previous, current.name, newName));
    }
  };

  const addField = (): void => {
    setFields((previous) => [...previous, withUid({ ...EMPTY_FIELD })]);
  };

  const removeField = (uid: number): void => {
    setFields((previous) => previous.filter((entry) => entry.uid !== uid));
  };

  const moveField = (uid: number, direction: -1 | 1): void => {
    setFields((previous) => {
      const index = previous.findIndex((entry) => entry.uid === uid);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      const current = next[index];
      const other = next[target];
      if (current === undefined || other === undefined) return previous;
      next[index] = other;
      next[target] = current;
      return next;
    });
  };

  const toggleGuardrail = (id: string): void => {
    setGuardrails((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id],
    );
  };

  const addCustomGuardrail = (): void => {
    const value = customGuardrail.trim();
    if (value === "" || guardrails.includes(value)) return;
    setGuardrails((previous) => [...previous, value]);
    setCustomGuardrail("");
  };

  const removeGuardrail = (value: string): void => {
    setGuardrails((previous) => previous.filter((entry) => entry !== value));
  };

  const changeMode = (next: TemplateFormMode): void => {
    if (next === mode) return;
    if (next === "simple") {
      if (
        (templateKey !== null || seed !== null) &&
        !window.confirm(
          "Le mode simple régénère le prompt et la fiche à partir des réglages et des informations. Continuer ?",
        )
      ) {
        return;
      }
      setMode("simple");
      return;
    }
    if (mode === "simple") {
      setFields((previous) => materializeSimpleFieldNames(previous));
    }
    setAiAssist(false);
    setSystemPrompt(effectivePrompt);
    setRenderTemplateText(effectiveRender);
    setMode("expert");
  };

  const onAiGenerated = (result: TemplateAiGenerationDto): void => {
    setAiGeneration(result);
    setAiKnowledge(result.draft.knowledge);
    setAiMergePolicy(null);
    setKey(result.key);
    setKeyTouched(true);
    setLabel(result.draft.label);
    setDescription(result.draft.description);
    setRole(result.draft.role);
    setObjective(result.draft.objective);
    setLanguageMode(result.draft.language.mode);
    setLanguageValue(result.draft.language.mode === "fixed" ? result.draft.language.value : "");
    setTone(result.draft.tone);
    setGuardrails(result.draft.guardrails);
    setExtraInstructions(result.draft.extraInstructions);
    setHasSimpleSettings(true);
    setFields(result.draft.fields.map((field) => withUid(draftFromApi(field))));
    setSystemPrompt(result.draft.systemPrompt);
    setRenderTemplateText(result.draft.renderTemplate);
    setMode("simple");
    setAiAssist(true);
    setError(null);
  };

  const runSave = async (knowledgePolicy: "append" | "replace" = "append"): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      if (label.trim() === "") {
        setError("Le nom du modèle est obligatoire");
        return;
      }
      const prepared = fieldsToTemplateFields(fields, mode);
      if (mode === "simple" && role.trim() === "") {
        setError("Le rôle de l'assistant est obligatoire.");
        return;
      }
      const prompt =
        mode === "simple"
          ? buildDefaultSystemPrompt({
              role,
              objective,
              language: languagePolicy,
              tone,
              guardrails,
              extraInstructions,
              fields: prepared,
            })
          : systemPrompt.trim();
      const render =
        mode === "simple" ? buildDefaultRenderTemplate(label, prepared) : renderTemplateText;
      if (prompt === "") {
        setError("Le comportement de l'assistant est obligatoire");
        return;
      }
      if (render.trim() === "") {
        setError("La fiche reçue par l'équipe est obligatoire");
        return;
      }

      if (
        templateKey !== null &&
        !window.confirm(
          "Cette modification crée une nouvelle version du modèle. Les liens déjà actifs conservent leur version figée et ne seront pas mis à jour automatiquement. Continuer ?",
        )
      ) {
        return;
      }

      const effectiveKey =
        templateKey ?? (key.trim() || uniqueTemplateKey(toTemplateKey(label), existingKeys));
      const definition = {
        key: templateKey ?? effectiveKey,
        label: label.trim(),
        description: description.trim(),
        systemPrompt: prompt,
        renderTemplate: render,
        fields: prepared,
        ...(mode === "simple" ? { simple: simpleSettings } : {}),
      };

      if (aiGeneration !== null) {
        const response = await fetch("/api/templates/ai/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(templateKey === null ? {} : { templateKey }),
            definition,
            knowledge: aiKnowledge,
            mergePolicy: knowledgePolicy,
            generationId: aiGeneration.generationId,
          }),
        });
        const json = (await response.json()) as {
          version?: { version?: number };
          knowledge?: { created?: number; replaced?: number; skipped?: number };
          error?: string;
        };
        if (!response.ok || json.version?.version === undefined) {
          setError(json.error ?? "Enregistrement impossible");
          return;
        }
        const knowledgeMessage =
          json.knowledge === undefined
            ? ""
            : ` · ${json.knowledge.created ?? 0} connaissance(s) ajoutée(s)`;
        if (templateKey !== null) {
          toast.warning(
            `Version ${json.version.version} enregistrée${knowledgeMessage}. Les liens existants restent sur leur ancienne version figée.`,
            {
              durationMs: 15000,
              action: { label: "Voir les liens de chat", href: "/liens" },
            },
          );
        } else {
          toast.success(`Modèle créé (version ${json.version.version})${knowledgeMessage}.`);
        }
        onSaved();
        return;
      }

      const payload = definition;
      const response =
        templateKey === null
          ? await fetch("/api/templates", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/templates/${templateKey}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      const json = (await response.json()) as { version?: { version?: number }; error?: string };
      if (!response.ok || json.version?.version === undefined) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      if (templateKey !== null) {
        toast.warning(
          `Version ${json.version.version} enregistrée. Les liens existants restent sur leur ancienne version figée : mettez-les à jour explicitement pour appliquer les nouveaux champs.`,
          {
            durationMs: 15000,
            action: { label: "Voir les liens de chat", href: "/liens" },
          },
        );
      } else {
        toast.success(`Modèle créé (version ${json.version.version}).`);
      }
      onSaved();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (aiAssist && aiGeneration === null) {
      setError("Générez d'abord le modèle avec l'assistance IA.");
      return;
    }
    if (
      aiGeneration !== null &&
      aiGeneration.existingAiKnowledgeCount > 0 &&
      aiMergePolicy === null
    ) {
      setAiMergeOpen(true);
      return;
    }
    await runSave(aiMergePolicy ?? "append");
  };

  return (
    <form className="form template-form" onSubmit={onSubmit} noValidate>
      <div className="template-form-main">
        {templateKey !== null ? (
          <div className="alert warning" role="status">
            <strong>Snapshot immuable :</strong> modifier ce modèle crée une nouvelle version. Les
            liens déjà actifs conservent leur ancienne version et ne sont pas mis à jour
            automatiquement. Pour appliquer les nouveaux champs, mettez à jour le lien concerné.
          </div>
        ) : null}

        <div className="template-mode-switch">
          <button
            type="button"
            className={mode === "simple" ? "btn small" : "btn ghost small"}
            aria-pressed={mode === "simple"}
            onClick={() => changeMode("simple")}
          >
            Simple
          </button>
          <button
            type="button"
            className={mode === "expert" ? "btn small" : "btn ghost small"}
            aria-pressed={mode === "expert"}
            onClick={() => changeMode("expert")}
          >
            Expert
          </button>
        </div>
        <p className="hint" style={{ marginTop: "-0.5rem" }}>
          {mode === "simple"
            ? "Le prompt et la fiche sont générés automatiquement. Passez en mode expert pour les personnaliser."
            : "Toutes les options techniques sont accessibles : clé, prompt brut et mise en page Markdown."}
        </p>
        {mode === "simple" ? (
          <>
            <label className="check template-ai-switch">
              <input
                type="checkbox"
                checked={aiAssist}
                disabled={pending}
                onChange={(event) => {
                  const next = event.target.checked;
                  if (next) setMode("simple");
                  setAiAssist(next);
                }}
              />{" "}
              <strong>Assistance par IA</strong>
              <span className="hint">
                Remplit automatiquement le modèle à partir d'une description, d'un site et de
                documents.
              </span>
            </label>
            {aiAssist ? (
              <TemplateAiAssistPanel templateKey={templateKey} onGenerated={onAiGenerated} />
            ) : null}
            {aiAssist && aiGeneration !== null ? (
              <TemplateAiReview
                result={aiGeneration}
                knowledge={aiKnowledge}
                onKnowledgeChange={setAiKnowledge}
                onAdjustSimple={() => setAiAssist(false)}
                onExpert={() => {
                  setAiAssist(false);
                  changeMode("expert");
                }}
              />
            ) : null}
          </>
        ) : null}
        {seed !== null ? (
          <p className="hint">
            Le modèle source est copié à l’identique. Modifiez ce que vous voulez, ou passez en mode
            simple pour repartir de zéro.
          </p>
        ) : null}

        {!aiAssist ? (
          <div className="grid-2">
            <label className="field">
              Nom du modèle *
              <input
                type="text"
                value={label}
                onChange={(event) => {
                  const value = event.target.value;
                  setLabel(value);
                  if (templateKey === null && !keyTouched) {
                    setKey(uniqueTemplateKey(toTemplateKey(value), existingKeys));
                  }
                }}
                placeholder="Qualification artisan"
                required
              />
            </label>
            <label className="field">
              Description courte
              <input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="À quoi sert ce modèle ?"
              />
            </label>
          </div>
        ) : null}

        {mode === "simple" ? (
          !aiAssist ? (
            <>
              {templateKey !== null && definitionLoaded && !hasSimpleSettings ? (
                <p className="alert warning">
                  Cette ancienne version ne contient pas les réglages du mode Simple. Le prompt
                  existant reste disponible en mode Expert ; si tu enregistres en Simple, il sera
                  régénéré à partir des champs ci-dessous.
                </p>
              ) : null}
              <fieldset className="field template-section">
                <legend>Objectif et comportement</legend>
                <label className="field">
                  Rôle de l'assistant *
                  <input
                    type="text"
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    placeholder="assistant de qualification, conseiller commercial…"
                    required
                  />
                </label>
                <label className="field">
                  Objectif de la conversation
                  <textarea
                    rows={3}
                    value={objective}
                    onChange={(event) => setObjective(event.target.value)}
                    placeholder="Comprendre le besoin et réunir les informations nécessaires."
                  />
                </label>
                <div className="grid-2">
                  <label className="field">
                    Langue de réponse
                    <select
                      value={languageMode}
                      onChange={(event) =>
                        setLanguageMode(event.target.value === "fixed" ? "fixed" : "auto")
                      }
                    >
                      <option value="auto">Automatique — langue du visiteur</option>
                      <option value="fixed">Langue fixe</option>
                    </select>
                  </label>
                  {languageMode === "fixed" ? (
                    <label className="field">
                      Langue
                      <input
                        type="text"
                        list="template-language-suggestions"
                        value={languageValue}
                        onChange={(event) => setLanguageValue(event.target.value)}
                        placeholder="français, malgache, anglais…"
                      />
                      <datalist id="template-language-suggestions">
                        <option value="français" />
                        <option value="anglais" />
                        <option value="malgache" />
                        <option value="espagnol" />
                        <option value="allemand" />
                        <option value="italien" />
                        <option value="portugais" />
                        <option value="arabe" />
                        <option value="chinois" />
                      </datalist>
                      <span className="hint">
                        Si la langue est vide, le mode automatique est appliqué.
                      </span>
                    </label>
                  ) : (
                    <div className="field">
                      <span className="hint">
                        Le modèle suit la langue du visiteur et s'adapte s'il en change.
                      </span>
                    </div>
                  )}
                </div>
                <label className="field">
                  Ton
                  <input
                    type="text"
                    list="template-tone-suggestions"
                    value={tone}
                    onChange={(event) => setTone(event.target.value)}
                    placeholder="professionnel et chaleureux, direct, pédagogique…"
                  />
                  <datalist id="template-tone-suggestions">
                    {PROMPT_TONES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </datalist>
                  <span className="hint">
                    Texte libre : tu peux combiner plusieurs tons ou en inventer un.
                  </span>
                </label>
                <div className="template-guardrails">
                  <strong>Garde-fous</strong>
                  <span className="hint">Aucun n'est activé par défaut.</span>
                  {PROMPT_GUARDRAILS.map((guardrail) => (
                    <label className="check" key={guardrail.id}>
                      <input
                        type="checkbox"
                        checked={guardrails.includes(guardrail.id)}
                        onChange={() => toggleGuardrail(guardrail.id)}
                      />{" "}
                      {guardrail.label}
                    </label>
                  ))}
                  {guardrails
                    .filter(
                      (value) => !PROMPT_GUARDRAILS.some((guardrail) => guardrail.id === value),
                    )
                    .map((value) => (
                      <div className="field-row" key={value}>
                        <div className="field-row-head">
                          <span>{value}</span>
                          <button
                            type="button"
                            className="btn danger ghost small"
                            onClick={() => removeGuardrail(value)}
                          >
                            Retirer
                          </button>
                        </div>
                      </div>
                    ))}
                  <div className="grid-2">
                    <label className="field">
                      Ajouter un garde-fou personnalisé
                      <input
                        type="text"
                        value={customGuardrail}
                        onChange={(event) => setCustomGuardrail(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addCustomGuardrail();
                          }
                        }}
                        placeholder="Ex. : ne jamais parler de concurrence"
                      />
                    </label>
                    <div className="field">
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={addCustomGuardrail}
                        disabled={customGuardrail.trim() === ""}
                      >
                        + Ajouter
                      </button>
                    </div>
                  </div>
                </div>
                <label className="field">
                  Instructions supplémentaires
                  <textarea
                    rows={3}
                    value={extraInstructions}
                    onChange={(event) => setExtraInstructions(event.target.value)}
                    placeholder="Ex. : proposer un rendez-vous après la qualification, ne jamais parler de concurrence…"
                  />
                </label>
                <p className="hint">
                  La clé technique et la mise en page sont générées automatiquement.
                </p>
              </fieldset>
            </>
          ) : null
        ) : (
          <>
            {templateKey === null ? (
              <label className="field">
                Clé technique *
                <input
                  type="text"
                  value={key}
                  onChange={(event) => {
                    setKeyTouched(true);
                    setKey(event.target.value);
                  }}
                  placeholder="mon-modele"
                  required
                />
                <span className="hint">
                  Minuscules, chiffres et tirets. Elle sert aux liens et aux fiches.
                </span>
              </label>
            ) : (
              <p className="hint">
                Clé : <code>{templateKey}</code> (immuable — les liens et fiches y font référence).
              </p>
            )}

            <label className="field">
              Prompt système * (variables :{" "}
              {
                "{{champs_guide}}, {{prospect_nom}}, {{prospect_contexte}}, {{visitor_nom}}, {{date}}…"
              }
              )
              <textarea
                rows={8}
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                required
              />
              <span className="hint">
                Le mode simple n’affiche pas cette zone : il la génère depuis l’objectif et les
                informations à collecter.
              </span>
            </label>

            <label className="field">
              Fiche reçue par l'équipe (Markdown) * ({"{{champ}}"} et {"{{#if champ}}…{{/if}}"},
              sans imbrication)
              <textarea
                rows={8}
                value={renderTemplateText}
                onChange={(event) => setRenderTemplateText(event.target.value)}
                required
              />
            </label>
          </>
        )}

        {!aiAssist ? (
          <fieldset className="field template-section">
            <legend>Informations à collecter</legend>
            {fields.map((field, position) => (
              <div className="field-row" key={field.uid}>
                <div className="field-row-head">
                  <strong>Information {position + 1}</strong>
                  <div className="tools">
                    <button
                      type="button"
                      className="btn ghost small"
                      aria-label="Monter cette information"
                      disabled={position === 0}
                      onClick={() => moveField(field.uid, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      aria-label="Descendre cette information"
                      disabled={position === fields.length - 1}
                      onClick={() => moveField(field.uid, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn danger ghost small"
                      onClick={() => removeField(field.uid)}
                    >
                      Retirer
                    </button>
                  </div>
                </div>

                {mode === "simple" ? (
                  <>
                    <div className="grid-2">
                      <label className="field">
                        Information à collecter *
                        <input
                          type="text"
                          placeholder="Budget total"
                          value={field.label}
                          onChange={(event) => updateFieldLabel(field.uid, event.target.value)}
                        />
                      </label>
                      <label className="field">
                        Exemple de réponse
                        <input
                          type="text"
                          placeholder="5 000 €"
                          value={field.example}
                          onChange={(event) =>
                            updateField(field.uid, { example: event.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="grid-2">
                      <label className="field">
                        Format
                        <select
                          value={field.type}
                          onChange={(event) => updateField(field.uid, { type: event.target.value })}
                        >
                          {FIELD_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {field.type === "select" || field.type === "multi" ? (
                        <label className="field">
                          Choix possibles (séparés par des virgules)
                          <input
                            type="text"
                            placeholder="a, b, c"
                            value={field.options}
                            onChange={(event) =>
                              updateField(field.uid, { options: event.target.value })
                            }
                          />
                        </label>
                      ) : null}
                    </div>
                    {field.type === "file" ? (
                      <FileConstraintsEditor
                        field={field}
                        onChange={(patch) => updateField(field.uid, patch)}
                      />
                    ) : null}
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          updateField(field.uid, { required: event.target.checked })
                        }
                      />{" "}
                      Toujours demander
                    </label>
                  </>
                ) : (
                  <>
                    <label className="field">
                      Type
                      <select
                        value={field.type}
                        onChange={(event) => updateField(field.uid, { type: event.target.value })}
                      >
                        {FIELD_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Libellé
                      <input
                        type="text"
                        placeholder="Budget"
                        value={field.label}
                        onChange={(event) => updateField(field.uid, { label: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      Exemple de réponse
                      <input
                        type="text"
                        placeholder="5 000 €"
                        value={field.example}
                        onChange={(event) =>
                          updateField(field.uid, { example: event.target.value })
                        }
                      />
                    </label>
                    {field.type === "file" ? (
                      <FileConstraintsEditor
                        field={field}
                        onChange={(patch) => updateField(field.uid, patch)}
                      />
                    ) : null}
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          updateField(field.uid, { required: event.target.checked })
                        }
                      />{" "}
                      Requis
                    </label>
                    {field.type === "select" || field.type === "multi" ? (
                      <label className="field">
                        Options (séparées par des virgules)
                        <input
                          type="text"
                          placeholder="a, b, c"
                          value={field.options}
                          onChange={(event) =>
                            updateField(field.uid, { options: event.target.value })
                          }
                        />
                      </label>
                    ) : null}
                    <div className="grid-2">
                      <label className="field">
                        Requis si le champ…
                        <select
                          value={field.requiredIfField}
                          onChange={(event) =>
                            updateField(field.uid, { requiredIfField: event.target.value })
                          }
                        >
                          <option value="">Aucun</option>
                          {fields
                            .filter((other) => other.uid !== field.uid && other.name.trim() !== "")
                            .map((other) => (
                              <option key={other.uid} value={other.name}>
                                {other.label.trim() === "" ? other.name : other.label}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field">
                        …vaut
                        <input
                          type="text"
                          placeholder="reprendre"
                          value={field.requiredIfEquals}
                          onChange={(event) =>
                            updateField(field.uid, { requiredIfEquals: event.target.value })
                          }
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
            ))}
            <div className="tools">
              <button type="button" className="btn ghost small" onClick={addField}>
                + Ajouter une information
              </button>
            </div>
          </fieldset>
        ) : null}

        <div className="tools">
          <button
            type="submit"
            className="btn small"
            disabled={pending || (aiAssist && aiGeneration === null)}
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" className="btn ghost small" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </div>

      <TemplateLivePreview definition={previewDefinition} ready={label.trim() !== ""} />
      {aiMergeOpen ? (
        <KnowledgeMergeDialog
          existingCount={aiGeneration?.existingAiKnowledgeCount ?? 0}
          onCancel={() => setAiMergeOpen(false)}
          onChoose={(policy) => {
            setAiMergeOpen(false);
            setAiMergePolicy(policy);
            void runSave(policy);
          }}
        />
      ) : null}
    </form>
  );
}
