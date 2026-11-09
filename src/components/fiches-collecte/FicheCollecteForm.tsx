"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import {
  isFicheReferenceFieldType,
  TEMPLATE_FIELD_TYPES,
  type TemplateFieldType,
} from "@/domain/entities/chat-template";
import type { FicheStatusDefinition } from "@/domain/entities/fiche-status";
import type { FicheCollecteDto } from "./types";

type StatusDraft = FicheStatusDefinition;

type FieldDraft = {
  id: string;
  name: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  options: string;
  example: string;
  unit: string;
  ficheKey: string;
};

const FIELD_TYPE_OPTIONS: { value: TemplateFieldType; label: string }[] = [
  ...TEMPLATE_FIELD_TYPES.map((type) => ({ value: type, label: type })),
  { value: "fiche", label: "Fiche liée (1..1)" },
  { value: "tableau_de_fiches", label: "Tableau de fiches (1..n)" },
];

type Draft = {
  key: string;
  label: string;
  description: string;
  intent: string;
  renderTemplate: string;
  instructions: string;
  fields: FieldDraft[];
  statuses: StatusDraft[];
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
          name: "",
          label: "Contact",
          type: "text",
          required: true,
          options: "",
          example: "",
          unit: "",
          ficheKey: "",
        },
      ],
      statuses: [],
    };
  }
  return {
    key: fiche.key,
    label: fiche.label,
    description: fiche.description,
    intent: fiche.intent,
    renderTemplate: fiche.renderTemplate,
    instructions: fiche.instructions,
    statuses: fiche.statuses,
    fields: fiche.fields.map((field) => ({
      id: newId(),
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      options: field.options?.join(", ") ?? "",
      example: field.example ?? "",
      unit: field.unit ?? "",
      ficheKey: field.ficheKey ?? "",
    })),
  };
}

function slugifyStatusKey(label: string): string {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return normalized === "" ? "statut" : normalized;
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
      let name = field.name.trim() === "" ? base : field.name.trim();
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
        ...((field.type === "select" || field.type === "multi") && options.length > 0
          ? { options }
          : {}),
        ...(field.example.trim() === "" ? {} : { example: field.example.trim() }),
        ...(field.type === "number" && field.unit.trim() !== "" ? { unit: field.unit.trim() } : {}),
        ...(isFicheReferenceFieldType(field.type) ? { ficheKey: field.ficheKey.trim() } : {}),
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
    statuses: draft.statuses.map((status) => ({
      key: status.key.trim(),
      label: status.label.trim(),
      order: status.order,
      ...(status.color?.trim() ? { color: status.color.trim() } : {}),
      isDefault: status.isDefault,
      archivedAt: status.archivedAt,
      updatedAt: new Date().toISOString(),
    })),
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
  const [availableFiches, setAvailableFiches] = useState<FicheCollecteDto[]>([]);
  useToastOnMessage(error);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/fiches-collecte", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { fiches?: FicheCollecteDto[] } | null) => {
        if (!cancelled && Array.isArray(json?.fiches)) setAvailableFiches(json.fiches);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const updateStatus = (index: number, patch: Partial<StatusDraft>): void => {
    setDraft((current) => ({
      ...current,
      statuses: current.statuses.map((status, position) =>
        position === index ? { ...status, ...patch } : status,
      ),
    }));
  };

  const setDefaultStatus = (index: number): void => {
    setDraft((current) => ({
      ...current,
      statuses: current.statuses.map((status, position) => ({
        ...status,
        isDefault: position === index,
      })),
    }));
  };

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
                  unit: "",
                  ficheKey: "",
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
              {FIELD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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
          {isFicheReferenceFieldType(field.type) ? (
            <label className="field">
              Fiche modèle
              <select
                value={field.ficheKey}
                onChange={(event) => updateField(index, { ficheKey: event.target.value })}
                required
              >
                <option value="">Choisir une fiche…</option>
                {availableFiches
                  .filter((entry) => entry.id !== fiche?.id)
                  .map((entry) => (
                    <option key={entry.id} value={entry.key}>
                      {entry.label} ({entry.key})
                    </option>
                  ))}
              </select>
              {availableFiches.length === 0 ? (
                <span className="hint">Aucune fiche de collecte disponible.</span>
              ) : null}
            </label>
          ) : null}
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
          {field.type === "number" ? (
            <label className="field">
              Unité (€, Ar…)
              <input
                type="text"
                maxLength={8}
                value={field.unit}
                onChange={(event) => updateField(index, { unit: event.target.value })}
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

      <div className="chatbot-fields-head" style={{ marginTop: "1.5rem" }}>
        <strong>Statuts de qualification ({draft.statuses.length})</strong>
        <button
          type="button"
          className="btn ghost small"
          onClick={() =>
            setDraft((current) => ({
              ...current,
              statuses: [
                ...current.statuses,
                {
                  key: "",
                  label: "",
                  order: current.statuses.length,
                  isDefault: current.statuses.length === 0,
                  archivedAt: null,
                  updatedAt: new Date().toISOString(),
                },
              ],
            }))
          }
        >
          Ajouter un statut
        </button>
      </div>
      <p className="hint">
        Les statuts sont des métadonnées internes : ils ne sont pas des champs de la fiche et ne
        sont jamais affichés au visiteur.
      </p>
      {draft.statuses.map((status, index) => (
        <div className="field-row" key={status.key === "" ? status.updatedAt : status.key}>
          <label className="field">
            Statut
            <input
              type="text"
              value={status.label}
              placeholder="À qualifier"
              onChange={(event) => {
                const label = event.target.value;
                updateStatus(index, {
                  label,
                  ...(status.key === "" ? { key: slugifyStatusKey(label) } : {}),
                });
              }}
            />
          </label>
          <label className="field">
            Clé
            <input
              type="text"
              value={status.key}
              disabled={status.key !== "" && fiche !== null}
              onChange={(event) => updateStatus(index, { key: event.target.value })}
            />
          </label>
          <label className="field">
            Ordre
            <input
              type="number"
              value={status.order}
              onChange={(event) => updateStatus(index, { order: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            Couleur
            <input
              type="text"
              value={status.color ?? ""}
              placeholder="#..."
              onChange={(event) => updateStatus(index, { color: event.target.value })}
            />
          </label>
          <label className="field checkbox">
            <input
              type="checkbox"
              checked={status.isDefault}
              onChange={() => setDefaultStatus(index)}
            />
            Défaut
          </label>
          <label className="field checkbox">
            <input
              type="checkbox"
              checked={status.archivedAt !== null}
              onChange={(event) =>
                updateStatus(index, {
                  archivedAt: event.target.checked ? new Date().toISOString() : null,
                })
              }
            />
            Archivé
          </label>
          <button
            type="button"
            className="btn ghost small"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                statuses: current.statuses.filter((_entry, position) => position !== index),
              }))
            }
          >
            Retirer
          </button>
        </div>
      ))}

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
