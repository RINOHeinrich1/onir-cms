"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";

/** Création d'organisation (super-admin) — nom prérempli côté serveur si vide. */
export function OrganizationForm({ onCreated }: { onCreated: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Création impossible");
        return;
      }
      toast.success("Organisation créée.");
      onCreated();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="form card" onSubmit={onSubmit} noValidate>
      <h3>Nouvelle organisation</h3>
      {error !== null ? <p className="alert error">{error}</p> : null}
      <label className="field">
        Nom (vide = partie locale de votre email)
        <input type="text" name="name" maxLength={120} />
      </label>
      <div className="tools">
        <button type="submit" className="btn small" disabled={pending}>
          {pending ? "Création…" : "Créer et provisionner"}
        </button>
      </div>
    </form>
  );
}
