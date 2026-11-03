"use client";

import { type FormEvent, useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import type { TemplateField } from "@/domain/entities/chat-template";
import { MANUAL_FICHE_DEFINITION } from "@/domain/entities/fiche";

type LinkedChatbot = { id: string; label: string };

type FicheFormProps = {
  links: readonly LinkedChatbot[];
  onSaved: () => void;
  onCancel: () => void;
};

const inputType = (field: TemplateField): "email" | "url" | "text" => {
  if (field.type === "email") return "email";
  if (field.type === "url") return "url";
  return "text";
};

function initialValues(fields: readonly TemplateField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field.name, field.type === "multi" ? [] : ""]));
}

const FIELDS = MANUAL_FICHE_DEFINITION.fields;

/** Création manuelle d'une fiche à partir de la définition intégrée (ADR-0055). */
export function FicheForm({ links, onSaved, onCancel }: FicheFormProps) {
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues(FIELDS));
  const [chatLinkIds, setChatLinkIds] = useState<string[]>([]);

  const setField = (name: string, value: unknown): void => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/fiches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: values, chatLinkIds }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Échec de l'enregistrement");
        return;
      }
      toast.success("Fiche de prospection enregistrée.");
      onSaved();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const renderField = (field: TemplateField) => {
    if (field.type === "multi") {
      const selectedValues = Array.isArray(values[field.name])
        ? (values[field.name] as string[])
        : [];
      return (
        <fieldset className="field" key={field.name}>
          <legend>
            {field.label}
            {field.required ? " *" : ""}
          </legend>
          {(field.options ?? []).map((option) => (
            <label key={option} className="check">
              <input
                type="checkbox"
                checked={selectedValues.includes(option)}
                disabled={pending}
                onChange={(event) =>
                  setField(
                    field.name,
                    event.target.checked
                      ? [...selectedValues, option]
                      : selectedValues.filter((value) => value !== option),
                  )
                }
              />{" "}
              {option}
            </label>
          ))}
        </fieldset>
      );
    }

    if (field.type === "select") {
      return (
        <label className="field" key={field.name}>
          {field.label}
          {field.required ? " *" : ""}
          <select
            value={typeof values[field.name] === "string" ? String(values[field.name]) : ""}
            disabled={pending}
            required={field.required}
            onChange={(event) => setField(field.name, event.target.value)}
          >
            <option value="">— Choisir —</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field.type === "textarea") {
      return (
        <label className="field" key={field.name}>
          {field.label}
          {field.required ? " *" : ""}
          <textarea
            name={field.name}
            rows={3}
            value={typeof values[field.name] === "string" ? String(values[field.name]) : ""}
            disabled={pending}
            required={field.required}
            placeholder={field.example ?? ""}
            onChange={(event) => setField(field.name, event.target.value)}
          />
        </label>
      );
    }

    if (field.type === "file") {
      return (
        <div className="field" key={field.name}>
          <span>
            {field.label}
            {field.required ? " *" : ""}
          </span>
          <p className="hint">
            Les champs fichiers ne sont pas encore déposables depuis la création manuelle.
          </p>
        </div>
      );
    }

    return (
      <label className="field" key={field.name}>
        {field.label}
        {field.required ? " *" : ""}
        <input
          type={inputType(field)}
          name={field.name}
          value={typeof values[field.name] === "string" ? String(values[field.name]) : ""}
          disabled={pending}
          required={field.required}
          placeholder={field.example ?? ""}
          onChange={(event) => setField(field.name, event.target.value)}
        />
      </label>
    );
  };

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {error !== null ? <p className="alert error">{error}</p> : null}

      <p className="hint">
        La fiche utilise la définition de prospection intégrée : {MANUAL_FICHE_DEFINITION.label}.
      </p>

      {FIELDS.map(renderField)}

      <fieldset className="field">
        <legend>Chatbots associés (optionnel, 0..N)</legend>
        {links.length === 0 ? (
          <p className="hint">Aucun chatbot disponible. La fiche restera indépendante.</p>
        ) : (
          links.map((link) => (
            <label key={link.id} className="check">
              <input
                type="checkbox"
                checked={chatLinkIds.includes(link.id)}
                disabled={pending}
                onChange={() =>
                  setChatLinkIds((current) =>
                    current.includes(link.id)
                      ? current.filter((id) => id !== link.id)
                      : [...current, link.id],
                  )
                }
              />{" "}
              {link.label || "Chatbot sans nom"}
            </label>
          ))
        )}
      </fieldset>

      <div className="tools">
        <button type="submit" className="btn small" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" className="btn ghost small" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
