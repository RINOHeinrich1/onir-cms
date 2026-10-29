"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import type { TemplateField } from "@/domain/entities/chat-template";
import type { FicheCollecte } from "@/domain/entities/fiche-collecte";

type LinkedChatbot = { id: string; label: string };

type FicheFormProps = {
  links: readonly LinkedChatbot[];
  fichesCollecte: readonly FicheCollecte[];
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

/** Création manuelle d'une fiche à partir d'une fiche de collecte (ADR-0055). */
export function FicheForm({ links, fichesCollecte, onSaved, onCancel }: FicheFormProps) {
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [ficheCollecteId, setFicheCollecteId] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [chatLinkIds, setChatLinkIds] = useState<string[]>([]);

  const selected = useMemo(
    () => fichesCollecte.find((fiche) => fiche.id === ficheCollecteId) ?? null,
    [fichesCollecte, ficheCollecteId],
  );
  const fields = selected?.fields ?? [];

  const selectFiche = (id: string): void => {
    const next = fichesCollecte.find((fiche) => fiche.id === id) ?? null;
    setFicheCollecteId(id);
    setValues(next === null ? {} : initialValues(next.fields));
    setError(null);
  };

  const setField = (name: string, value: unknown): void => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (selected === null) {
      setError("Choisissez une fiche de collecte");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/fiches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ficheCollecteId: selected.id,
          ficheCollecteVersion: selected.version,
          data: values,
          chatLinkIds,
        }),
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
            Les champs fichiers d’une fiche de collecte ne sont pas encore déposables depuis la
            création manuelle.
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

      <label className="field">
        Fiche de collecte *
        <select
          value={ficheCollecteId}
          disabled={pending}
          onChange={(event) => selectFiche(event.target.value)}
        >
          <option value="">— Choisir une fiche —</option>
          {fichesCollecte.map((fiche) => (
            <option key={fiche.id} value={fiche.id}>
              {fiche.label} (v{fiche.version})
            </option>
          ))}
        </select>
        {selected === null ? (
          <span className="hint">
            La fiche de collecte détermine les champs du formulaire et le rendu du lead.
          </span>
        ) : (
          <span className="hint">
            {selected.description ||
              `Version ${selected.version} — ${selected.fields.length} champ(s).`}
          </span>
        )}
      </label>

      {fichesCollecte.length === 0 ? (
        <p className="hint">
          Aucune fiche de collecte disponible.{" "}
          <a href="/fiches-collecte/nouveau">Créer une fiche de collecte</a>.
        </p>
      ) : null}

      {selected === null ? null : (
        <>
          {fields.length === 0 ? (
            <p className="hint">Cette fiche de collecte ne déclare aucun champ.</p>
          ) : (
            fields.map(renderField)
          )}

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
        </>
      )}

      <div className="tools">
        <button type="submit" className="btn small" disabled={pending || selected === null}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" className="btn ghost small" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
