"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { CategoryPicker } from "@/components/categories/CategoryPicker";
import { TemplateKeyPicker } from "@/components/ui/TemplateKeyPicker";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import { DescriptionField } from "./DescriptionField";
import type { MediaDto } from "./types";

/** Édition d'un média : libellé, portée, actif (+ URL pour un lien). */
export function MediaEditForm({
  media,
  canWrite,
  onSaved,
  onCancel,
}: {
  media: MediaDto;
  canWrite: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [actif, setActif] = useState(media.actif);
  const [templateKeys, setTemplateKeys] = useState<string[]>(media.templateKeys);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      libelle: String(data.get("libelle") ?? ""),
      description: String(data.get("description") ?? ""),
      templateKeys,
      actif,
    };
    if (media.type === "lien") {
      payload.url = String(data.get("url") ?? "");
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/medias/${media.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      toast.success("Média mis à jour.");
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
        Libellé *
        <input type="text" name="libelle" maxLength={120} defaultValue={media.libelle} required />
      </label>

      <DescriptionField defaultValue={media.description} />

      {media.type === "lien" ? (
        <label className="field">
          URL *
          <input type="url" name="url" defaultValue={media.url ?? ""} required />
        </label>
      ) : null}

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

      <CategoryPicker contentType="media" contentId={media.id} canAssign={canWrite} />

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
