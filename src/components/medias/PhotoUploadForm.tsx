"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { TemplateKeyPicker } from "@/components/ui/TemplateKeyPicker";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { DescriptionField } from "./DescriptionField";

/** Formulaire d'import d'une photo (fichier + libellé + portée + actif). */
export function PhotoUploadForm({
  onSaved,
  onCancel,
}: {
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [actif, setActif] = useState(true);
  const [fichier, setFichier] = useState<File | null>(null);
  const [templateKeys, setTemplateKeys] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (fichier === null) {
      setError("Choisissez un fichier image");
      return;
    }
    const form = new FormData(event.currentTarget);
    form.set("actif", actif ? "true" : "false");
    form.set("fichier", fichier);
    for (const key of templateKeys) form.append("templateKeys", key);

    setPending(true);
    try {
      const response = await fetch("/api/medias/photo", { method: "POST", body: form });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Import impossible");
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
        Fichier image * (PNG, JPEG, WebP, GIF, AVIF — 6 Mo max)
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          onChange={(event) => setFichier(event.target.files?.[0] ?? null)}
        />
      </label>

      <label className="field">
        Libellé * (référencé tel quel par l&apos;IA, 120 car. max)
        <input type="text" name="libelle" maxLength={120} required />
      </label>

      <DescriptionField />

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
          {pending ? "Import…" : "Importer"}
        </button>
        <button type="button" className="btn ghost small" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
