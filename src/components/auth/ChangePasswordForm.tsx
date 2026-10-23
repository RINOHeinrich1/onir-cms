"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

type ChangeResponse = { ok?: boolean; error?: string };

/** Formulaire de rotation forcée du mot de passe (US-AUTH-001). */
export function ChangePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");

    if (newPassword !== confirmation) {
      setError("La confirmation ne correspond pas au nouveau mot de passe");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = (await response.json()) as ChangeResponse;
      if (!response.ok || json.ok !== true) {
        setError(json.error ?? "Changement impossible");
        return;
      }
      router.replace("/");
      router.refresh();
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
        Mot de passe actuel
        <input type="password" name="currentPassword" autoComplete="current-password" required />
      </label>

      <label className="field">
        Nouveau mot de passe
        <input type="password" name="newPassword" autoComplete="new-password" required />
        <span className="hint">8 caractères minimum.</span>
      </label>

      <label className="field">
        Confirmation
        <input type="password" name="confirmation" autoComplete="new-password" required />
      </label>

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Enregistrement…" : "Changer le mot de passe"}
      </button>
    </form>
  );
}
