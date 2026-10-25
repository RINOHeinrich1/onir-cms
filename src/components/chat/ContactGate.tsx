"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { CONTACT_TYPES } from "@/domain/entities/chat";
import type { ChatMessageDto } from "./types";

type ContactGateProps = {
  token: string;
  onStarted: (conversationId: string, messages: ChatMessageDto[]) => void;
  /** Politique de confidentialité à accepter (null = aucune). */
  confidentialite: { texte: string; lien: string } | null;
  /** Mode anonyme : seule la politique (si présente) est demandée. */
  anonymous?: boolean;
};

type ExtraContact = {
  id: number;
  type: string;
  valeur: string;
};

/**
 * Identification du visiteur avant discussion (lien standard).
 * Nom + email requis, contacts complémentaires optionnels (téléphone,
 * WhatsApp, site web, autre). Time-trap anti-spam (aucun champ à remplir).
 */
export function ContactGate({
  token,
  onStarted,
  confidentialite,
  anonymous = false,
}: ContactGateProps) {
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [extras, setExtras] = useState<ExtraContact[]>([]);
  // Compteur d'identifiants stables (clés React, pas d'index de tableau).
  const nextId = useRef<number>(1);
  // Instant de chargement pour le time-trap anti-spam (aucun champ à remplir).
  const loadedAt = useRef<number>(Date.now());

  const addExtra = (): void => {
    const id = nextId.current;
    nextId.current += 1;
    setExtras((previous) => [...previous, { id, type: "téléphone", valeur: "" }]);
  };

  const setExtra = (id: number, patch: Partial<ExtraContact>): void => {
    setExtras((previous) =>
      previous.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  };

  const removeExtra = (id: number): void => {
    setExtras((previous) => previous.filter((entry) => entry.id !== id));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const contacts = extras
      .filter((entry) => entry.valeur.trim() !== "")
      .map((entry) => ({ type: entry.type, valeur: entry.valeur.trim() }));

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          ...(anonymous
            ? {}
            : {
                nom: String(data.get("nom") ?? ""),
                email: String(data.get("email") ?? ""),
                contacts,
              }),
          consentement: data.get("consentement") !== null,
          loadedAt: loadedAt.current,
        }),
      });
      const json = (await response.json()) as {
        conversationId?: string;
        messages?: ChatMessageDto[];
        error?: string;
      };
      if (!response.ok || typeof json.conversationId !== "string") {
        setError(
          json.error ??
            "Impossible de démarrer la discussion. Vérifiez votre connexion puis réessayez.",
        );
        return;
      }
      onStarted(json.conversationId, json.messages ?? []);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="card">
      <h1 className="text-title">{anonymous ? "Avant de démarrer…" : "Avant de discuter…"}</h1>
      <p className="hint">
        {anonymous
          ? "Aucun nom ni contact ne vous sera demandé. La conversation reste anonyme."
          : "Indiquez votre nom et votre email pour démarrer la conversation."}
      </p>
      {error !== null ? <p className="alert error">{error}</p> : null}
      <form className="form" onSubmit={onSubmit} noValidate>
        {anonymous ? null : (
          <>
            <label className="field">
              Nom *
              <input type="text" name="nom" autoComplete="name" required />
            </label>
            <label className="field">
              Email *
              <input type="email" name="email" autoComplete="email" required />
            </label>
          </>
        )}

        {anonymous
          ? null
          : extras.map((extra) => (
              <div className="grid-2" key={extra.id}>
                <label className="field">
                  Type
                  <select
                    value={extra.type}
                    onChange={(event) => setExtra(extra.id, { type: event.target.value })}
                  >
                    {CONTACT_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Valeur
                  <div className="tools">
                    <input
                      type="text"
                      value={extra.valeur}
                      onChange={(event) => setExtra(extra.id, { valeur: event.target.value })}
                      placeholder="Numéro, lien…"
                    />
                    <button
                      type="button"
                      className="btn danger ghost small"
                      onClick={() => removeExtra(extra.id)}
                    >
                      Retirer
                    </button>
                  </div>
                </label>
              </div>
            ))}

        {anonymous || extras.length >= 5 ? null : (
          <div className="tools">
            <button type="button" className="btn ghost small" onClick={() => addExtra()}>
              + Ajouter un contact
            </button>
          </div>
        )}

        {confidentialite !== null ? (
          <label className="check consent">
            <input type="checkbox" name="consentement" required />
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
          <button type="submit" className="btn" disabled={pending}>
            {pending ? "Démarrage…" : "Démarrer la discussion"}
          </button>
        </div>
      </form>
    </section>
  );
}
