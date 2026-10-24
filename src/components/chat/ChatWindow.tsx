"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Lightbox, type LightboxImage } from "@/components/ui/Lightbox";
import type { ChatMessageMedia } from "@/domain/entities/chat";
import type { ChatMessageDto } from "./types";

type Message = ChatMessageDto;

type ChatWindowProps = {
  /** Null en mode anonyme : la session est créée au premier message. */
  conversationId: string | null;
  /** Jeton du lien, requis pour créer une session anonyme à la volée. */
  token?: string;
  /** Mode anonyme : aucun formulaire, pas de fiche nominative. */
  anonymous?: boolean;
  /** Historique éventuel (reprise de conversation). */
  initialMessages?: ChatMessageDto[];
};

/** Heure courte (HH:MM) d'un message, dans la locale du navigateur. */
function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Fenêtre de discussion avec l'IA (US-CHAT-001/002).
 * Expérience conversationnelle : journal scrollable à défilement ancré,
 * composeur qui s'agrandit (Entrée envoie, Maj+Entrée saute une ligne),
 * indicateur de frappe, et génération de la fiche via « Terminer ».
 */
export function ChatWindow({
  conversationId,
  token,
  anonymous = false,
  initialMessages,
}: ChatWindowProps) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(conversationId);
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [docs, setDocs] = useState<{ pdf: string; md: string } | null>(null);
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const programmaticRef = useRef(false);
  const programmaticTimer = useRef<number | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Descend au dernier message. Le défilement est marqué « programmatique »
   * pendant l'animation : sans cela, les positions intermédiaires du
   * défilement fluide feraient croire que l'utilisateur a remonté le fil et
   * désactiveraient le suivi automatique des réponses suivantes.
   */
  const scrollToBottom = (smooth: boolean): void => {
    const el = logRef.current;
    if (el === null) return;
    programmaticRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    window.clearTimeout(programmaticTimer.current);
    programmaticTimer.current = window.setTimeout(
      () => {
        programmaticRef.current = false;
      },
      smooth ? 700 : 80,
    );
  };

  // Suivi du bas du journal, hors défilement programmatique.
  const onLogScroll = (): void => {
    if (programmaticRef.current) return;
    const el = logRef.current;
    if (el === null) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Ancrage à chaque changement (message envoyé, réponse IA, indicateur de frappe).
  // biome-ignore lint/correctness/useExhaustiveDependencies: relance le défilement sur nouveaux messages
  useEffect(() => {
    if (stickRef.current) scrollToBottom(true);
  }, [messages, pending]);

  // Ancrage initial au chargement.
  // biome-ignore lint/correctness/useExhaustiveDependencies: défilement initial unique
  useEffect(() => {
    scrollToBottom(false);
    return () => window.clearTimeout(programmaticTimer.current);
  }, []);

  // Composeur auto-extensible (jusqu'à 9rem), puis défilement interne.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ajuste la hauteur à chaque frappe
  useEffect(() => {
    const el = inputRef.current;
    if (el === null) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [draft]);

  /**
   * Recherche asynchrone des médias d'une réponse (US-MEDIA-001) : déclenchée
   * seulement si la réponse a signalé `mediaPending`. L'image s'affiche après
   * le texte, une fois la sélection revenue (idempotente côté serveur).
   */
  const ensureConversation = async (): Promise<string | null> => {
    if (activeConversationId !== null) return activeConversationId;
    if (token === undefined) return null;
    const response = await fetch("/api/chat/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, loadedAt: Date.now() - 5000 }),
    });
    const json = (await response.json()) as {
      conversationId?: string;
      messages?: Message[];
      error?: string;
    };
    if (!response.ok || typeof json.conversationId !== "string") {
      setError(json.error ?? "Démarrage de la discussion impossible");
      return null;
    }
    setActiveConversationId(json.conversationId);
    if (json.messages !== undefined && json.messages.length > 0) {
      setMessages((previous) => (previous.length === 0 ? (json.messages as Message[]) : previous));
    }
    return json.conversationId;
  };

  const loadMedia = async (message: Message, conversationId: string): Promise<void> => {
    try {
      const response = await fetch("/api/chat/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, messageId: message.id }),
      });
      if (!response.ok) return;
      const json = (await response.json()) as { medias?: ChatMessageMedia[] };
      if (json.medias === undefined || json.medias.length === 0) return;
      setMessages((previous) =>
        previous.map((entry) =>
          entry.id === message.id ? { ...entry, medias: json.medias as ChatMessageMedia[] } : entry,
        ),
      );
    } catch {
      // Échec silencieux : la réponse texte reste affichée sans média.
    }
  };

  const send = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const content = draft.trim();
    if (content === "" || pending) return;

    const local: Message = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      medias: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((previous) => [...previous, local]);
    stickRef.current = true;
    setDraft("");
    setPending(true);
    setError(null);

    try {
      const activeId = await ensureConversation();
      if (activeId === null) return;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, content }),
      });
      const json = (await response.json()) as {
        message?: Message;
        mediaPending?: boolean;
        error?: string;
      };
      if (!response.ok || json.message === undefined) {
        setError(json.error ?? "Réponse impossible pour le moment");
        return;
      }
      const answer = json.message;
      setMessages((previous) => [...previous, answer]);
      if (json.mediaPending === true) {
        void loadMedia(answer, activeId);
      }
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
      // Garde le focus pour enchaîner la saisie sans clic supplémentaire.
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const finish = async (): Promise<void> => {
    if (anonymous || finishing || docs !== null) return;
    const activeId = activeConversationId;
    if (activeId === null) return;
    if (!window.confirm("Terminer la discussion et générer la fiche de prospection ?")) return;
    setFinishing(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId }),
      });
      const json = (await response.json()) as {
        markdown?: string;
        pdfBase64?: string;
        error?: string;
      };
      if (!response.ok || typeof json.markdown !== "string") {
        setError(
          json.error ??
            "La fiche est incomplète : poursuivez la discussion pour préciser le projet.",
        );
        return;
      }
      const mdBlob = new Blob([json.markdown], { type: "text/markdown;charset=utf-8" });
      const pdfBlob = new Blob(
        [Uint8Array.from(atob(json.pdfBase64 ?? ""), (char) => char.charCodeAt(0))],
        { type: "application/pdf" },
      );
      setDocs({ md: URL.createObjectURL(mdBlob), pdf: URL.createObjectURL(pdfBlob) });
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setFinishing(false);
    }
  };

  const canSend = draft.trim() !== "" && !pending;

  return (
    <div className="chat">
      <div
        className="chat-log"
        ref={logRef}
        onScroll={onLogScroll}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        <p className="chat-intro">
          {anonymous
            ? "Décrivez votre demande. Je vous réponds sans demander vos coordonnées."
            : "Décrivez votre projet (type de plateforme, objectif, budget, délai). Je vous pose quelques questions puis je prépare une fiche récapitulative."}
        </p>

        <ul className="chat-log-list">
          {messages.map((message) => (
            <li key={message.id} className={`msg ${message.role}`}>
              <span className="msg-avatar" aria-hidden="true">
                {message.role === "user" ? "Moi" : "IA"}
              </span>
              <div className="msg-body">
                {message.role === "assistant" ? (
                  <div className="bubble">
                    <div className="md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </div>
                    {message.medias.length > 0 ? (
                      <ul className="chat-media">
                        {message.medias.map((media) =>
                          media.type === "photo" ? (
                            <li key={media.id} className="chat-media-item">
                              <button
                                type="button"
                                className="chat-media-zoom"
                                onClick={() =>
                                  setLightbox({ url: media.url, libelle: media.libelle })
                                }
                                aria-label={`Agrandir : ${media.libelle}`}
                              >
                                {/* biome-ignore lint/performance/noImgElement: fichier servi par route (uuid) */}
                                <img
                                  className="chat-media-photo"
                                  src={media.url}
                                  alt={media.libelle}
                                  loading="lazy"
                                />
                              </button>
                            </li>
                          ) : (
                            <li key={media.id} className="chat-media-item">
                              <a
                                className="chat-media-lien"
                                href={media.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {media.libelle}
                              </a>
                            </li>
                          ),
                        )}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <p className="bubble">{message.content}</p>
                )}
                <span className="msg-time">{formatTime(message.createdAt)}</span>
              </div>
            </li>
          ))}

          {pending ? (
            <li className="msg assistant">
              <span className="msg-avatar" aria-hidden="true">
                IA
              </span>
              <div className="msg-body">
                <span className="bubble">
                  <span className="sr-only">L&apos;assistant écrit</span>
                  <span className="typing" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
              </div>
            </li>
          ) : null}
        </ul>
      </div>

      {error !== null ? <p className="alert error chat-fiche">{error}</p> : null}

      {docs !== null ? (
        <div className="chat-fiche" role="status">
          <span style={{ flex: 1 }}>Fiche de prospection prête.</span>
          <a className="btn small" href={docs.pdf} download="fiche-projet.pdf">
            PDF
          </a>
          <a className="btn ghost small" href={docs.md} download="fiche-projet.md">
            Markdown
          </a>
        </div>
      ) : null}

      {lightbox !== null ? <Lightbox image={lightbox} onClose={() => setLightbox(null)} /> : null}

      <form className="chat-composer" ref={formRef} onSubmit={send}>
        <div className="chat-composer-inner">
          <label className="sr-only" htmlFor="chat-message">
            Votre message
          </label>
          <textarea
            id="chat-message"
            ref={inputRef}
            className="chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Écrivez votre message…"
            rows={1}
            maxLength={4000}
          />
          <div className="chat-actions">
            {anonymous ? null : (
              <button
                type="button"
                className="chat-finish"
                disabled={finishing || docs !== null || messages.length === 0}
                onClick={() => void finish()}
              >
                {finishing ? "…" : "Terminer"}
              </button>
            )}
            <button type="submit" className="chat-send" disabled={!canSend} aria-label="Envoyer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 12l16-8-6 8 6 8-16-8z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <p className="chat-composer-hint">
          Entrée pour envoyer · Maj+Entrée pour un retour à la ligne
        </p>
      </form>
    </div>
  );
}
