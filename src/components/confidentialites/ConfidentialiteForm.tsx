"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import type { ConfidentialiteDto } from "./types";

/** Création / modification d'une politique de confidentialité (US-CONFID-001). */
export function ConfidentialiteForm({
  confidentialite,
  onSaved,
  onCancel,
}: {
  confidentialite: ConfidentialiteDto | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [actif, setActif] = useState(confidentialite?.actif ?? true);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      titre: String(data.get("titre") ?? ""),
      texte: String(data.get("texte") ?? ""),
      lien: String(data.get("lien") ?? ""),
      actif,
    };
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        confidentialite === null
          ? "/api/confidentialites"
          : `/api/confidentialites/${confidentialite.id}`,
        {
          method: confidentialite === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Enregistrement impossible");
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
        Titre * (unique, 120 car. max)
        <input
          type="text"
          name="titre"
          maxLength={120}
          defaultValue={confidentialite?.titre ?? ""}
          required
        />
      </label>

      <label className="field">
        Texte du consentement * (affiché au visiteur avant la discussion)
        <textarea
          name="texte"
          rows={4}
          defaultValue={confidentialite?.texte ?? ""}
          placeholder="J'accepte que mes informations soient enregistrées et traitées…"
          required
        />
      </label>

      <label className="field">
        Lien de la politique (vide = aucun lien ; ex. /confidentialite ou une URL)
        <input
          type="text"
          name="lien"
          defaultValue={confidentialite?.lien ?? ""}
          placeholder="/confidentialite"
        />
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={actif}
          onChange={(event) => setActif(event.target.checked)}
        />{" "}
        Active
      </label>

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
