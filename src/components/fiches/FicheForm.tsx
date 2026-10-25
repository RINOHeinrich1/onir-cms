"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import { STATUTS_FICHE } from "@/domain/entities/fiche";

const PLATEFORMES = ["site web", "SaaS", "mobile", "automatisme background"] as const;

type FicheFormProps = {
  onSaved: () => void;
  onCancel: () => void;
};

/** Formulaire de création d'une fiche de prospection (RM-FICHE-001/002). */
export function FicheForm({ onSaved, onCancel }: FicheFormProps) {
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [plateformes, setPlateformes] = useState<string[]>(["site web"]);
  const [statut, setStatut] = useState<string>("initier");

  const togglePlateforme = (value: string): void => {
    setPlateformes((previous) =>
      previous.includes(value) ? previous.filter((entry) => entry !== value) : [...previous, value],
    );
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/fiches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plateformes,
          description: String(data.get("description") ?? ""),
          budget: String(data.get("budget") ?? ""),
          duree: String(data.get("duree") ?? ""),
          contact: String(data.get("contact") ?? ""),
          statut,
          contraintesTechno: String(data.get("contraintesTechno") ?? ""),
          lienDocSpec: String(data.get("lienDocSpec") ?? ""),
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

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {error !== null ? <p className="alert error">{error}</p> : null}

      <fieldset className="field">
        <legend>Plateformes * (plusieurs possibles)</legend>
        {PLATEFORMES.map((value) => (
          <label key={value} className="check">
            <input
              type="checkbox"
              checked={plateformes.includes(value)}
              onChange={() => togglePlateforme(value)}
            />{" "}
            {value}
          </label>
        ))}
      </fieldset>

      <div className="grid-2">
        <label className="field">
          Budget *
          <input type="text" name="budget" required />
        </label>
        <label className="field">
          Durée prévue *
          <input type="text" name="duree" required />
        </label>
      </div>

      <label className="field">
        Description du projet * (objet, rôle, périmètre)
        <textarea name="description" rows={4} required />
      </label>

      <label className="field">
        Contact du prospect *
        <input type="text" name="contact" required />
      </label>

      <label className="field">
        Statut de lancement *
        <select value={statut} onChange={(event) => setStatut(event.target.value)}>
          {STATUTS_FICHE.map((value) => (
            <option key={value} value={value}>
              {value === "initier" ? "Projet à initier" : "Projet à reprendre"}
            </option>
          ))}
        </select>
      </label>

      {statut === "reprendre" ? (
        <label className="field">
          Contraintes technologiques *
          <textarea name="contraintesTechno" rows={3} required />
        </label>
      ) : (
        <input type="hidden" name="contraintesTechno" value="" />
      )}

      <label className="field">
        Lien vers le document de spécifications
        <input type="url" name="lienDocSpec" placeholder="https://…" />
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
