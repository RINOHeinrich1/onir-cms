"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { TemplateKeyPicker } from "@/components/ui/TemplateKeyPicker";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { DescriptionField } from "./DescriptionField";

/** Formulaire de création d'un lien média (libellé + URL + portée + actif). */
export function LienForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [actif, setActif] = useState(true);
  const [templateKeys, setTemplateKeys] = useState<string[]>([]);

  useEffect(() => {
    setError(null);
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      libelle: String(data.get("libelle") ?? ""),
      description: String(data.get("description") ?? ""),
      url: String(data.get("url") ?? ""),
      templateKeys,
      actif,
    };
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/medias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Création impossible");
        return;
      }
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
        Libellé * (référencé tel quel par l&apos;IA, 120 car. max)
        <input type="text" name="libelle" maxLength={120} required />
      </label>

      <DescriptionField />

      <label className="field">
        URL *
        <input type="url" name="url" placeholder="https://…" required />
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
