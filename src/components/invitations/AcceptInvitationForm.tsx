"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

type AcceptResponse = {
  ok?: boolean;
  mustChangePassword?: boolean;
  error?: string;
};

/** Formulaire public d'acceptation d'une invitation par lien. */
export function AcceptInvitationForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password !== confirmation) {
      setError("La confirmation ne correspond pas au mot de passe");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          password,
          website: String(data.get("website") ?? ""),
        }),
      });
      const json = (await response.json()) as AcceptResponse;
      if (!response.ok || json.ok !== true) {
        setError(json.error ?? "Acceptation impossible");
        return;
      }
      router.replace(json.mustChangePassword === true ? "/change-password" : "/");
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="form" method="post" onSubmit={onSubmit} noValidate>
      {error !== null ? <p className="alert error">{error}</p> : null}

      <label className="field">
        Nom complet
        <input type="text" name="name" autoComplete="name" maxLength={80} required />
      </label>

      <label className="field">
        Email
        <input type="email" name="email" autoComplete="username" required />
      </label>

      <label className="field">
        Mot de passe
        <input type="password" name="password" autoComplete="new-password" minLength={8} required />
        <span className="hint">
          Si un compte existe déjà avec cet email, saisissez son mot de passe actuel. 8 caractères
          minimum pour un nouveau compte.
        </span>
      </label>

      <label className="field">
        Confirmation
        <input type="password" name="confirmation" autoComplete="new-password" required />
      </label>

      <div className="hp" aria-hidden>
        <label>
          Ne pas remplir
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Acceptation…" : "Rejoindre l'organisation"}
      </button>
    </form>
  );
}
