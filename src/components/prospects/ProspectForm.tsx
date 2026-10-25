"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import { NATURES_PROSPECT } from "@/domain/entities/prospect";
import type { ProspectDto } from "./types";

type ProspectFormProps = {
  editing: ProspectDto | null;
  onSaved: () => void;
  onCancel: () => void;
};

/** Formulaire de création / modification d'un prospect (RM-PROSPECT-001). */
export function ProspectForm({ editing, onSaved, onCancel }: ProspectFormProps) {
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [nature, setNature] = useState<string>("physique");

  useEffect(() => {
    setNature(editing?.nature ?? "physique");
    setError(null);
  }, [editing]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      nom: String(data.get("nom") ?? ""),
      prenom: String(data.get("prenom") ?? ""),
      nature,
      email: String(data.get("email") ?? ""),
      activite: String(data.get("activite") ?? ""),
      fonction: String(data.get("fonction") ?? ""),
      detail: String(data.get("detail") ?? ""),
    };

    setPending(true);
    setError(null);
    try {
      const response =
        editing === null
          ? await fetch("/api/prospects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/prospects/${editing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Échec de l'enregistrement");
        return;
      }
      toast.success("Prospect enregistré.");
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

      <div className="grid-2">
        <label className="field">
          Nom *
          <input type="text" name="nom" defaultValue={editing?.nom ?? ""} required />
        </label>
        <label className="field">
          Prénom
          <input type="text" name="prenom" defaultValue={editing?.prenom ?? ""} />
        </label>
      </div>

      <div className="grid-2">
        <label className="field">
          Nature *
          <select value={nature} onChange={(event) => setNature(event.target.value)}>
            {NATURES_PROSPECT.map((value) => (
              <option key={value} value={value}>
                {value === "physique" ? "Personne physique" : "Personne morale"}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Email *
          <input type="email" name="email" defaultValue={editing?.email ?? ""} required />
        </label>
      </div>

      <div className="grid-2">
        <label className="field">
          Activité
          <input type="text" name="activite" defaultValue={editing?.activite ?? ""} />
        </label>
        <label className="field">
          Fonction
          <input type="text" name="fonction" defaultValue={editing?.fonction ?? ""} />
        </label>
      </div>

      <label className="field">
        Autre détail
        <textarea name="detail" rows={3} defaultValue={editing?.detail ?? ""} />
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
