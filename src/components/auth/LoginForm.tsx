"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { NO_ORGANIZATION_PATH } from "@/domain/session";

type LoginResponse = {
  ok?: boolean;
  mustChangePassword?: boolean;
  organization?: { id: string; name: string } | null;
  organizations?: { id: string; name: string }[];
  error?: string;
};

/** Formulaire de connexion (US-AUTH-001) — honeypot + redirection rotation. */
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  // Évite une soumission native (GET, mot de passe dans l’URL) avant hydratation.
  useEffect(() => {
    setReady(true);
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      website: String(data.get("website") ?? ""),
    };

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as LoginResponse;
      if (!response.ok || json.ok !== true) {
        setError(json.error ?? "Connexion impossible");
        return;
      }
      if (json.mustChangePassword === true) {
        router.replace("/change-password");
      } else if (json.organization == null) {
        // État « aucune organisation » (ADR-0025 §4).
        router.replace(NO_ORGANIZATION_PATH);
      } else {
        router.replace("/dashboard");
      }
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
        Email
        <input type="email" name="email" autoComplete="username" required />
      </label>

      <label className="field">
        Mot de passe
        <input type="password" name="password" autoComplete="current-password" required />
      </label>

      {/* Honeypot anti-bot — invisible pour l'utilisateur */}
      <div className="hp" aria-hidden>
        <label>
          Ne pas remplir
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <button type="submit" className="btn" disabled={pending || !ready}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
