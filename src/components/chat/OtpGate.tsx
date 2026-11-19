"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { ChatMessageDto } from "./types";

type OtpGateProps = {
  token: string;
  confidentialite: { texte: string; lien: string } | null;
  onStarted: (conversationId: string, messages: ChatMessageDto[]) => void;
};

type Challenge = { challengeId: string; expiresAt: string; transport: "organization" | "platform" };

/** Portail d'identification email OTP (ADR-0099). Le template ne porte jamais cette logique. */
export function OtpGate({ token, confidentialite, onStarted }: OtpGateProps) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const loadedAt = useRef<number>(Date.now());
  useToastOnMessage(error);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function requestCode(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    if (pending || cooldown > 0) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email,
          surface: "page",
          consentement: confidentialite === null || consent,
          loadedAt: loadedAt.current,
        }),
      });
      const json = (await response.json()) as Challenge & { error?: string };
      if (!response.ok || typeof json.challengeId !== "string") {
        setError(json.error ?? "Impossible d'envoyer le code");
        return;
      }
      setChallenge(json);
      setStep("code");
      setCooldown(60);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (challenge === null) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, challengeId: challenge.challengeId, code, surface: "page" }),
      });
      const json = (await response.json()) as {
        conversationId?: string;
        messages?: ChatMessageDto[];
        error?: string;
      };
      if (!response.ok || typeof json.conversationId !== "string") {
        setError(json.error ?? "Code invalide ou expiré");
        return;
      }
      onStarted(json.conversationId, json.messages ?? []);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card">
      <h1 className="text-title">Avant de discuter…</h1>
      <p className="hint">
        {step === "email"
          ? "Saisissez votre email : nous vous enverrons un code de vérification à 6 chiffres."
          : `Code envoyé à ${email}. Il expire dans 10 minutes.`}
      </p>
      {error !== null ? <p className="alert error">{error}</p> : null}

      {step === "email" ? (
        <form className="form" onSubmit={requestCode} noValidate>
          <label className="field">
            Email *
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {confidentialite !== null ? (
            <label className="check consent">
              <input
                type="checkbox"
                name="consentement"
                required
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                {confidentialite.texte}{" "}
                {confidentialite.lien !== "" ? (
                  <a href={confidentialite.lien} target="_blank" rel="noopener noreferrer">
                    Politique de confidentialité
                  </a>
                ) : null}
              </span>
            </label>
          ) : null}
          <div className="tools">
            <button type="submit" className="btn" disabled={pending || cooldown > 0}>
              {pending ? "Envoi…" : cooldown > 0 ? `Patientez ${cooldown} s` : "Recevoir un code"}
            </button>
          </div>
        </form>
      ) : (
        <form className="form" onSubmit={verify} noValidate>
          <label className="field">
            Code à 6 chiffres *
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          <div className="tools">
            <button type="submit" className="btn" disabled={pending || code.length !== 6}>
              {pending ? "Vérification…" : "Vérifier et démarrer"}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={pending || cooldown > 0}
              onClick={() => void requestCode()}
            >
              {cooldown > 0 ? `Renvoyer dans ${cooldown} s` : "Renvoyer le code"}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={pending}
              onClick={() => {
                setStep("email");
                setCode("");
                setChallenge(null);
              }}
            >
              Changer d'email
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
