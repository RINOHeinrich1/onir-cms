"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import { TEMPLATE_FIELD_TYPES, type TemplateFieldType } from "@/domain/entities/chat-template";
import type { FicheCollecteDto } from "./types";

type FieldDraft = {
  id: string;
  name: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  options: string;
  example: string;
};

type Draft = {
  key: string;
  label: string;
  description: string;
  intent: string;
  renderTemplate: string;
  instructions: string;
  fields: FieldDraft[];
};

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `field-${Math.random().toString(36).slice(2)}`;
}

function draftFromFiche(fiche: FicheCollecteDto | null): Draft {
  if (fiche === null) {
    return {
      key: "",
      label: "",
      description: "",
      intent: "",
      renderTemplate: "# {{contact}}\n",
      instructions: "",
      fields: [
        {
          id: newId(),
          name: "contact",
          label: "Contact",
          type: "text",
          required: true,
          options: "",
          example: "",
        },
      ],
    };
  }
  return {
    key: fiche.key,
    label: fiche.label,
    description: fiche.description,
    intent: fiche.intent,
    renderTemplate: fiche.renderTemplate,
    instructions: fiche.instructions,
    fields: fiche.fields.map((field) => ({
      id: newId(),
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options?.join(", ") ?? "",
      example: field.example ?? "",
    })),
  };
}

function slugifyFieldName(label: string): string {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized === "" ? "champ" : normalized;
}

function payload(draft: Draft): Record<string, unknown> {
  const used = new Set<string>();
  const fields = draft.fields
    .filter((field) => field.label.trim() !== "")
    .map((field) => {
      const base = slugifyFieldName(field.label);
      let name = base;
      let suffix = 2;
      while (used.has(name)) {
        name = `${base}_${suffix}`;
        suffix += 1;
      }
      used.add(name);
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
      };
    });
  const renderTemplate =
    `# ${draft.label.trim() === "" ? "Fiche de collecte" : draft.label.trim()}\n\n` +
    (fields.length === 0
      ? ""
      : fields.map((field) => `- **${field.label}** : {{${field.name}}}`).join("\n")) +
    "\n";
  return {
    key: draft.key.trim(),
    label: draft.label.trim(),
    description: draft.description.trim(),
    intent: draft.intent.trim(),
    renderTemplate,
    instructions: draft.instructions.trim(),
    fields,
  };
}

/** Création / édition d'une fiche de collecte réutilisable (ADR-0049). */
export function FicheCollecteForm({
  fiche,
  onSaved,
  onCancel,
}: {
  fiche: FicheCollecteDto | null;
  onSaved?: (fiche: FicheCollecteDto) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftFromFiche(fiche));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const updateField = (index: number, patch: Partial<FieldDraft>): void => {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, position) =>
        position === index ? { ...field, ...patch } : field,
      ),
    }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        fiche === null ? "/api/fiches-collecte" : `/api/fiches-collecte/${fiche.id}`,
        {
          method: fiche === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload(draft)),
        },
      );
      const json = (await response.json()) as { fiche?: FicheCollecteDto; error?: string };
      if (!response.ok || json.fiche === undefined) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      toast.success(fiche === null ? "Fiche créée." : "Nouvelle version créée.");
      if (onSaved !== undefined) {
        onSaved(json.fiche);
        return;
      }
      router.push("/fiches-collecte");
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {error !== null ? <p className="alert error">{error}</p> : null}

      {fiche !== null ? (
        <p className="hint">
          Version courante : v{fiche.version}. Enregistrer crée une nouvelle version immuable.
        </p>
      ) : null}

      <label className="field">
        Libellé *
        <input
          type="text"
          value={draft.label}
          maxLength={160}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder="Demande d'hôtel"
          required
        />
        <span className="hint">
          La clé technique est générée automatiquement à partir du libellé.
        </span>
      </label>

      <label className="field">
        Description
        <input
          type="text"
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
      </label>

      <label className="field">
        Intention
        <input
          type="text"
          value={draft.intent}
          onChange={(event) => setDraft({ ...draft, intent: event.target.value })}
          placeholder="Quand le visiteur cherche un hébergement"
        />
      </label>

      <label className="field">
        Instructions
        <textarea
          rows={3}
          value={draft.instructions}
          onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
        />
      </label>

      <div className="chatbot-fields-head">
        <strong>Champs ({draft.fields.length})</strong>
        <button
          type="button"
          className="btn ghost small"
          onClick={() =>
            setDraft({
              ...draft,
              fields: [
                ...draft.fields,
                {
                  id: newId(),
                  name: "",
                  label: "",
                  type: "text",
                  required: false,
                  options: "",
                  example: "",
                },
              ],
            })
          }
        >
          Ajouter un champ
        </button>
      </div>

      {draft.fields.map((field, index) => (
        <div className="field-row" key={field.id}>
          <label className="field">
            Libellé
            <input
              type="text"
              value={field.label}
              placeholder="Ville"
              onChange={(event) => updateField(index, { label: event.target.value })}
            />
          </label>
          <label className="field">
            Type
            <select
              value={field.type}
              onChange={(event) =>
                updateField(index, { type: event.target.value as TemplateFieldType })
              }
            >
              {TEMPLATE_FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="field checkbox">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(event) => updateField(index, { required: event.target.checked })}
            />
            Obligatoire
          </label>
          {field.type === "select" || field.type === "multi" ? (
            <label className="field">
              Options (virgules)
              <input
                type="text"
                value={field.options}
                onChange={(event) => updateField(index, { options: event.target.value })}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="btn ghost small"
            onClick={() =>
              setDraft({
                ...draft,
                fields: draft.fields.filter((_entry, position) => position !== index),
              })
            }
          >
            Retirer
          </button>
        </div>
      ))}

      <p className="hint">
        La structure de la fiche est générée automatiquement à partir des libellés et des champs.
      </p>

      <div className="tools">
        <button type="submit" className="btn" disabled={pending}>
          {pending
            ? "Enregistrement…"
            : fiche === null
              ? "Créer la fiche"
              : "Enregistrer la version"}
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={pending}
          onClick={() => (onCancel === undefined ? router.push("/fiches-collecte") : onCancel())}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
