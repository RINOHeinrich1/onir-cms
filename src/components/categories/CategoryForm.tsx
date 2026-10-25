"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { Category } from "@/domain/entities/category";

/** Création / édition d'une catégorie (label, description, ordre, actif). */
export function CategoryForm({
  category,
  onSaved,
  onCancel,
}: {
  category: Category | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [actif, setActif] = useState(category?.actif ?? true);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      label: String(data.get("label") ?? ""),
      description: String(data.get("description") ?? ""),
      position: Number(data.get("position") ?? 0),
      actif,
    };
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        category === null ? "/api/categories" : `/api/categories/${category.id}`,
        {
          method: category === null ? "POST" : "PATCH",
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
        Libellé *
        <input
          type="text"
          name="label"
          maxLength={80}
          defaultValue={category?.label ?? ""}
          required
        />
      </label>
      <label className="field">
        Description
        <textarea
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={category?.description ?? ""}
        />
      </label>
      <div className="grid-2">
        <label className="field">
          Position
          <input
            type="number"
            name="position"
            min={0}
            max={10000}
            defaultValue={category?.position ?? 0}
          />
        </label>
        <label className="check" style={{ alignSelf: "end" }}>
          <input
            type="checkbox"
            checked={actif}
            onChange={(event) => setActif(event.target.checked)}
          />{" "}
          Active
        </label>
      </div>
      {category !== null ? (
        <p className="hint">
          Slug stable : <code>{category.slug}</code>
        </p>
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
