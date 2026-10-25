"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
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
  DEFAULT_PROMPT_GUARDRAILS,
  DEFAULT_PROMPT_OBJECTIVE,
  DEFAULT_PROMPT_ROLE,
  PROMPT_GUARDRAILS,
  PROMPT_TONES,
  type PromptGuardrailId,
  toFieldName,
  toTemplateKey,
  uniqueFieldName,
  uniqueTemplateKey,
} from "@/domain/template-defaults";
import { TemplateLivePreview } from "./TemplateLivePreview";
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
    const name = uniqueFieldName(toFieldName(field.label.trim() || field.name.trim()), used);
    used.push(name);
    return { ...field, name };
  });
}

/**
 * Convertit les lignes d'édition en définition validable.
 * En mode simple, le nom technique est dérivé du libellé et rendu unique.
 */
function fieldsToTemplateFields(
  fields: readonly FieldRow[],
  mode: TemplateFormMode,
): TemplateField[] {
  const used: string[] = [];
  const result: TemplateField[] = [];

  for (const field of fields) {
    const label = field.label.trim();
    const rawName = field.name.trim();
    if (label === "" && rawName === "") continue;

    let name = rawName;
    if (name === "" || mode === "simple") {
      name = uniqueFieldName(toFieldName(label === "" ? rawName : label), used);
    }
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
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [mode, setMode] = useState<TemplateFormMode>(
    templateKey === null && seed === null ? "simple" : "expert",
  );
  const [key, setKey] = useState(templateKey ?? seed?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(false);
  const [label, setLabel] = useState(seed?.label ?? "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(() =>
    typeof seed?.definition.systemPrompt === "string" ? seed.definition.systemPrompt : "",
  );
  const [renderTemplateText, setRenderTemplateText] = useState(() =>
    typeof seed?.definition.renderTemplate === "string" ? seed.definition.renderTemplate : "",
  );
  const [role, setRole] = useState(DEFAULT_PROMPT_ROLE);
  const [objective, setObjective] = useState(seed?.description || DEFAULT_PROMPT_OBJECTIVE);
  const [tone, setTone] = useState<string>(PROMPT_TONES[0].value);
  const [guardrails, setGuardrails] = useState<PromptGuardrailId[]>([...DEFAULT_PROMPT_GUARDRAILS]);
  const [fields, setFields] = useState<FieldRow[]>(() =>
    seed === null ? [withUid({ ...EMPTY_FIELD })] : fieldsFromDefinition(seed.definition),
  );

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
        setObjective(json.template.description || DEFAULT_PROMPT_OBJECTIVE);
        setSystemPrompt(typeof definition.systemPrompt === "string" ? definition.systemPrompt : "");
        setRenderTemplateText(
          typeof definition.renderTemplate === "string" ? definition.renderTemplate : "",
        );
        setFields(fieldsFromDefinition(definition));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Chargement impossible");
      });
    return () => {
      cancelled = true;
    };
  }, [templateKey]);

  const preparedFields = useMemo(() => fieldsToTemplateFields(fields, mode), [fields, mode]);
  const generatedPrompt = useMemo(
    () =>
      buildDefaultSystemPrompt({
        role,
        objective,
        tone,
        guardrails,
        fields: preparedFields,
      }),
    [role, objective, tone, guardrails, preparedFields],
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
    }),
    [templateKey, key, label, description, effectivePrompt, preparedFields, effectiveRender],
  );

  const updateField = (uid: number, patch: Partial<TemplateFieldDraft>): void => {
    setFields((previous) =>
      previous.map((entry) => (entry.uid === uid ? { ...entry, ...patch } : entry)),
    );
  };

  const updateFieldLabel = (uid: number, value: string): void => {
    setFields((previous) =>
      previous.map((entry) => {
        if (entry.uid !== uid) return entry;
        if (mode === "expert") return { ...entry, label: value };
        const used = previous
          .filter((other) => other.uid !== uid && other.name.trim() !== "")
          .map((other) => other.name);
        return {
          ...entry,
          label: value,
          name: value.trim() === "" ? "" : uniqueFieldName(toFieldName(value), used),
        };
      }),
    );
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

  const toggleGuardrail = (id: PromptGuardrailId): void => {
    setGuardrails((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id],
    );
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
    setSystemPrompt(effectivePrompt);
    setRenderTemplateText(effectiveRender);
    setMode("expert");
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSavedVersion(null);
    try {
      if (label.trim() === "") {
        setError("Le nom du modèle est obligatoire");
        return;
      }
      const prepared = fieldsToTemplateFields(fields, mode);
      if (prepared.length === 0) {
        setError("Ajoutez au moins une information à collecter");
        return;
      }
      const prompt =
        mode === "simple"
          ? buildDefaultSystemPrompt({ role, objective, tone, guardrails, fields: prepared })
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

      const effectiveKey =
        templateKey ?? (key.trim() || uniqueTemplateKey(toTemplateKey(label), existingKeys));
      const payload = {
        key: templateKey ?? effectiveKey,
        label: label.trim(),
        description: description.trim(),
        systemPrompt: prompt,
        renderTemplate: render,
        fields: prepared,
      };
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
      setSavedVersion(json.version.version);
      onSaved();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="form template-form" onSubmit={onSubmit} noValidate>
      <div className="template-form-main">
        {error !== null ? <p className="alert error">{error}</p> : null}
        {savedVersion !== null ? (
          <p className="alert success" role="status">
            Version {savedVersion} enregistrée.
          </p>
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
        {seed !== null ? (
          <p className="hint">
            Le modèle source est copié à l’identique. Modifiez ce que vous voulez, ou passez en mode
            simple pour repartir de zéro.
          </p>
        ) : null}

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

        {mode === "simple" ? (
          <fieldset className="field template-section">
            <legend>Objectif et comportement</legend>
            <label className="field">
              Rôle de l'assistant
              <input
                type="text"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="l'assistant de prospection"
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
            <label className="field">
              Ton
              <select value={tone} onChange={(event) => setTone(event.target.value)}>
                {PROMPT_TONES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="template-guardrails">
              <strong>Garde-fous</strong>
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
            </div>
            <p className="hint">
              La clé technique et la mise en page sont générées automatiquement.
            </p>
          </fieldset>
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
                  <div className="grid-2">
                    <label className="field">
                      Nom technique
                      <input
                        type="text"
                        placeholder="budget"
                        value={field.name}
                        onChange={(event) => updateField(field.uid, { name: event.target.value })}
                      />
                    </label>
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
                  </div>
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
                      onChange={(event) => updateField(field.uid, { example: event.target.value })}
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
                      Requis si champ…
                      <input
                        type="text"
                        placeholder="statut"
                        value={field.requiredIfField}
                        onChange={(event) =>
                          updateField(field.uid, { requiredIfField: event.target.value })
                        }
                      />
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

        <div className="tools">
          <button type="submit" className="btn small" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" className="btn ghost small" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </div>

      <TemplateLivePreview
        definition={previewDefinition}
        ready={label.trim() !== "" && preparedFields.length > 0}
      />
    </form>
  );
}
