"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { CategoryPicker } from "@/components/categories/CategoryPicker";
import { TemplateKeyPicker } from "@/components/ui/TemplateKeyPicker";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import type { ConnaissanceDto } from "./types";

type ConnaissanceFormProps = {
  editing: ConnaissanceDto | null;
  onSaved: () => void;
  onCancel: () => void;
};

/** Formulaire de création / modification d'une entrée (titre unique, portée). */
export function ConnaissanceForm({ editing, onSaved, onCancel }: ConnaissanceFormProps) {
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [actif, setActif] = useState(true);
  const [templateKeys, setTemplateKeys] = useState<string[]>([]);

  useEffect(() => {
    setActif(editing?.actif ?? true);
    setTemplateKeys(editing?.templateKeys ?? []);
    setError(null);
  }, [editing]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      titre: String(data.get("titre") ?? ""),
      contenu: String(data.get("contenu") ?? ""),
      templateKeys,
      actif,
    };

    setPending(true);
    setError(null);
    try {
      const response =
        editing === null
          ? await fetch("/api/connaissances", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/connaissances/${editing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Échec de l'enregistrement");
        return;
      }
      toast.success("Connaissance enregistrée.");
      onSaved();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {error !== null ? <p className="alert error">{error}</p> : null}

      <label className="field">
        Titre * (référencé tel quel par l&apos;IA, 120 car. max)
        <input type="text" name="titre" defaultValue={editing?.titre ?? ""} required />
      </label>

      <label className="field">
        Contenu *
        <textarea name="contenu" rows={4} defaultValue={editing?.contenu ?? ""} required />
      </label>

      <div className="grid-2">
        <div className="field">
          <span>Portée (vide = globale)</span>
          <TemplateKeyPicker value={templateKeys} onChange={setTemplateKeys} />
        </div>
        <label className="check" style={{ alignSelf: "end" }}>
          <input
            type="checkbox"
            checked={actif}
            onChange={(event) => setActif(event.target.checked)}
          />{" "}
          Active
        </label>
      </div>

      {editing !== null ? (
        <CategoryPicker contentType="connaissance" contentId={editing.id} />
      ) : null}

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
