"use client";

import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatAttachmentDto } from "@/application/use-cases/attachments/attachment-dto";
import { confirmDialog } from "@/components/ui/confirm";
import { Lightbox, type LightboxImage } from "@/components/ui/Lightbox";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { ChatMessageMedia, ConversationInterventionMode } from "@/domain/entities/chat";
import type { TemplateFormField } from "@/domain/template-contract";
import type { ChatMessageDto } from "./types";

type Message = ChatMessageDto;

const POLL_MS = 4000;

function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
}

type ChatWindowProps = {
  /** Null en mode anonyme : la session est créée au premier message. */
  conversationId: string | null;
  /** Jeton du lien, requis pour créer une session anonyme à la volée. */
  token?: string;
  /** Mode anonyme : aucun formulaire, pas de fiche nominative. */
  anonymous?: boolean;
  /** Historique éventuel (reprise de conversation). */
  initialMessages?: ChatMessageDto[];
  /** Champs fichier demandés par le modèle (ADR-0034). */
  attachmentFields?: TemplateFormField[];
};

/** Heure courte (HH:MM) d'un message, dans la locale du navigateur. */
function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function inlineImageUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}inline=1`;
}

function AttachmentList({
  attachments,
  onImage,
}: {
  attachments: ChatAttachmentDto[];
  onImage: (image: LightboxImage) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul className="chat-attachments">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="chat-attachment-item">
          {attachment.mime.startsWith("image/") ? (
            <button
              type="button"
              className="chat-attachment-image"
              onClick={() =>
                onImage({
                  url: inlineImageUrl(attachment.url),
                  libelle: attachment.originalName,
                })
              }
              aria-label={`Agrandir : ${attachment.originalName}`}
            >
              {/* biome-ignore lint/performance/noImgElement: fichier servi par route privée */}
              <img
                src={inlineImageUrl(attachment.url)}
                alt={attachment.originalName}
                loading="lazy"
              />
            </button>
          ) : (
            <a
              className="chat-attachment-file"
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {attachment.originalName}
            </a>
          )}
          <span className="chat-attachment-label">{attachment.fieldLabel}</span>
        </li>
      ))}
    </ul>
  );
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
  attachmentFields = [],
}: ChatWindowProps) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(conversationId);
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [mode, setMode] = useState<ConversationInterventionMode>(
    initialMessages?.some((message) => message.role === "operator") === true ? "human" : "ai",
  );
  const [transport, setTransport] = useState<"sse" | "polling">("sse");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [docs, setDocs] = useState<
    { key: string; label: string; pdf: string; md: string }[] | null
  >(null);
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachmentDto[]>([]);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const programmaticRef = useRef(false);
  const programmaticTimer = useRef<number | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<string | null>(conversationId);
  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);
  const lastAtRef = useRef<string | null>(
    initialMessages === undefined || initialMessages.length === 0
      ? null
      : (initialMessages[initialMessages.length - 1]?.createdAt ?? null),
  );

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

  const receiveMessages = useCallback((incoming: Message[]): void => {
    if (incoming.length === 0) return;
    setMessages((previous) => mergeMessages(previous, incoming));
    const latest = incoming[incoming.length - 1];
    if (
      latest !== undefined &&
      (lastAtRef.current === null || latest.createdAt > lastAtRef.current)
    ) {
      lastAtRef.current = latest.createdAt;
    }
  }, []);

  // Temps réel visiteur (ADR-0043) : SSE nominal, polling 4 s en secours.
  useEffect(() => {
    if (activeConversationId === null) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      setTransport("polling");
      return;
    }
    const params = new URLSearchParams({ conversationId: activeConversationId });
    if (lastAtRef.current !== null) params.set("after", lastAtRef.current);
    const source = new EventSource(`/api/chat/stream?${params.toString()}`);
    let closed = false;

    const onMessage = (event: MessageEvent<string>): void => {
      try {
        receiveMessages([JSON.parse(event.data) as Message]);
      } catch {
        // Trame illisible : le polling corrigera l'état.
      }
    };
    const onState = (event: MessageEvent<string>): void => {
      try {
        const payload = JSON.parse(event.data) as {
          mode?: ConversationInterventionMode;
        };
        if (payload.mode === "ai" || payload.mode === "human") setMode(payload.mode);
      } catch {
        // Trame illisible.
      }
    };
    const onError = (): void => {
      if (closed) return;
      closed = true;
      source.close();
      setTransport("polling");
    };

    source.addEventListener("message", onMessage as EventListener);
    source.addEventListener("state", onState as EventListener);
    source.addEventListener("error", onError);

    return () => {
      closed = true;
      source.close();
    };
  }, [activeConversationId, receiveMessages]);

  // Repli polling : utilisé si SSE échoue ou si EventSource est indisponible.
  useEffect(() => {
    if (activeConversationId === null || transport !== "polling") return;
    let cancelled = false;

    const poll = async (): Promise<void> => {
      if (document.visibilityState === "hidden") return;
      const params = new URLSearchParams({ conversationId: activeConversationId });
      if (lastAtRef.current !== null) params.set("after", lastAtRef.current);
      try {
        const response = await fetch(`/api/chat/messages?${params.toString()}`, {
          cache: "no-store",
        });
        const json = (await response.json()) as {
          mode?: ConversationInterventionMode;
          messages?: Message[];
        };
        if (cancelled || !response.ok) return;
        if (json.mode === "ai" || json.mode === "human") setMode(json.mode);
        if (json.messages !== undefined) receiveMessages(json.messages);
      } catch {
        // Échec silencieux : le prochain tick réessaie.
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeConversationId, transport, receiveMessages]);

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
    if (conversationRef.current !== null) return conversationRef.current;
    if (token === undefined) return null;
    if (sessionPromiseRef.current !== null) return sessionPromiseRef.current;
    const promise = (async () => {
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
      conversationRef.current = json.conversationId;
      setActiveConversationId(json.conversationId);
      if (json.messages !== undefined && json.messages.length > 0) {
        setMessages((previous) =>
          previous.length === 0 ? (json.messages as Message[]) : previous,
        );
      }
      return json.conversationId;
    })();
    sessionPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      sessionPromiseRef.current = null;
    }
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

  const uploadAttachment = async (file: File, field: TemplateFormField): Promise<void> => {
    const activeId = await ensureConversation();
    if (activeId === null) return;
    const form = new FormData();
    form.append("conversationId", activeId);
    form.append("fieldName", field.name);
    form.append("fichier", file);
    setUploadingField(field.name);
    setError(null);
    try {
      const response = await fetch("/api/chat/attachments", {
        method: "POST",
        body: form,
      });
      const json = (await response.json()) as {
        attachment?: ChatAttachmentDto;
        error?: string;
      };
      if (!response.ok || json.attachment === undefined) {
        setError(json.error ?? "Envoi du fichier impossible");
        return;
      }
      setPendingAttachments((previous) => [...previous, json.attachment as ChatAttachmentDto]);
    } catch {
      setError("Erreur réseau pendant l'envoi du fichier");
    } finally {
      setUploadingField(null);
    }
  };

  const onFiles = (event: ChangeEvent<HTMLInputElement>, field: TemplateFormField): void => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    for (const file of files) void uploadAttachment(file, field);
  };

  const removePendingAttachment = async (attachment: ChatAttachmentDto): Promise<void> => {
    const activeId = activeConversationId;
    setPendingAttachments((previous) => previous.filter((entry) => entry.id !== attachment.id));
    if (activeId === null) return;
    await fetch(
      `/api/chat/attachments/${attachment.id}?conversationId=${encodeURIComponent(activeId)}`,
      { method: "DELETE" },
    ).catch(() => undefined);
  };

  const attachmentCount = (fieldName: string): number =>
    pendingAttachments.filter((attachment) => attachment.fieldName === fieldName).length +
    messages.reduce(
      (total, message) =>
        total +
        message.attachments.filter((attachment) => attachment.fieldName === fieldName).length,
      0,
    );

  const send = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const content = draft.trim();
    const attachments = pendingAttachments;
    if ((content === "" && attachments.length === 0) || pending || uploadingField !== null) {
      return;
    }

    const local: Message = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      medias: [],
      attachments,
      authorName: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((previous) => [...previous, local]);
    stickRef.current = true;
    setDraft("");
    setPending(true);
    setError(null);
    const removeLocal = (): void => {
      setMessages((previous) => previous.filter((message) => message.id !== local.id));
    };

    try {
      const activeId = await ensureConversation();
      if (activeId === null) {
        removeLocal();
        return;
      }
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId,
          content,
          attachmentIds: attachments.map((attachment) => attachment.id),
        }),
      });
      const json = (await response.json()) as {
        userMessage?: Message;
        message?: Message | null;
        mediaPending?: boolean;
        mode?: ConversationInterventionMode;
        error?: string;
      };
      if (!response.ok) {
        removeLocal();
        setError(json.error ?? "Réponse impossible pour le moment");
        return;
      }
      setPendingAttachments([]);
      if (json.mode === "ai" || json.mode === "human") setMode(json.mode);
      if (json.userMessage !== undefined) {
        const serverUser = json.userMessage;
        setMessages((previous) => {
          const withoutLocal = previous.filter((message) => message.id !== local.id);
          return mergeMessages(withoutLocal, [serverUser]);
        });
      }
      const answer = json.message ?? null;
      if (answer !== null) {
        receiveMessages([answer]);
        if (json.mediaPending === true) {
          void loadMedia(answer, activeId);
        }
      }
    } catch {
      removeLocal();
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

  const finish = async (abandonPending = false): Promise<void> => {
    if (anonymous || finishing || docs !== null) return;
    const activeId = activeConversationId;
    if (activeId === null) return;
    if (!(await confirmDialog("Terminer la discussion et générer la fiche de prospection ?")))
      return;
    setFinishing(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId,
          ...(abandonPending ? { abandonPending: true } : {}),
        }),
      });
      const json = (await response.json()) as {
        fiches?: { fiche?: { ficheKey?: string | null }; markdown?: string; pdfBase64?: string }[];
        markdown?: string;
        pdfBase64?: string;
        error?: string;
      };
      if (!response.ok) {
        const message =
          json.error ??
          "La fiche est incomplète : poursuivez la discussion pour préciser le projet.";
        if (!abandonPending && /abandonn/i.test(message)) {
          const confirmed = await confirmDialog(
            "Des fiches sont encore en cours. Les abandonner explicitement et terminer ?",
          );
          if (confirmed) {
            setFinishing(false);
            await finish(true);
            return;
          }
        }
        setError(message);
        return;
      }
      const entries: {
        fiche?: { ficheKey?: string | null };
        markdown?: string | undefined;
        pdfBase64?: string | undefined;
      }[] =
        json.fiches ??
        (typeof json.markdown === "string"
          ? [{ markdown: json.markdown, pdfBase64: json.pdfBase64 }]
          : []);
      const next = entries.map((entry, index) => {
        const mdBlob = new Blob([entry.markdown ?? ""], {
          type: "text/markdown;charset=utf-8",
        });
        const pdfBlob = new Blob(
          [Uint8Array.from(atob(entry.pdfBase64 ?? ""), (char) => char.charCodeAt(0))],
          { type: "application/pdf" },
        );
        return {
          key: entry.fiche?.ficheKey ?? `fiche-${index + 1}`,
          label: entry.fiche?.ficheKey ?? `Fiche ${index + 1}`,
          md: URL.createObjectURL(mdBlob),
          pdf: URL.createObjectURL(pdfBlob),
        };
      });
      setDocs(next);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setFinishing(false);
    }
  };

  const canSend =
    (draft.trim() !== "" || pendingAttachments.length > 0) && !pending && uploadingField === null;

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
                {message.role === "user" ? "Moi" : message.role === "operator" ? "Hum." : "IA"}
              </span>
              <div className="msg-body">
                {message.role === "operator" ? (
                  <span className="msg-operator-label">Conseiller</span>
                ) : null}
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
                    <AttachmentList attachments={message.attachments} onImage={setLightbox} />
                  </div>
                ) : (
                  <div className="bubble">
                    {message.content !== "" ? <p>{message.content}</p> : null}
                    <AttachmentList attachments={message.attachments} onImage={setLightbox} />
                  </div>
                )}
                <span className="msg-time">{formatTime(message.createdAt)}</span>
              </div>
            </li>
          ))}

          {pending && mode === "ai" ? (
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
          <span style={{ flex: 1 }}>
            {docs.length === 0
              ? "Discussion terminée : aucune fiche n'a été générée."
              : `${docs.length} fiche(s) prête(s).`}
          </span>
          {docs.map((document) => (
            <span key={document.key} className="chat-fiche-item">
              <span>{document.label}</span>
              <a className="btn small" href={document.pdf} download={`${document.key}.pdf`}>
                PDF
              </a>
              <a className="btn ghost small" href={document.md} download={`${document.key}.md`}>
                Markdown
              </a>
            </span>
          ))}
        </div>
      ) : null}

      {lightbox !== null ? <Lightbox image={lightbox} onClose={() => setLightbox(null)} /> : null}

      {mode === "human" ? (
        <p className="chat-human-notice" role="status">
          Un conseiller a rejoint la conversation. Vos messages lui sont transmis.
        </p>
      ) : null}

      <form className="chat-composer" ref={formRef} onSubmit={send}>
        {attachmentFields.length > 0 ? (
          <div className="chat-attachments-bar">
            {attachmentFields.map((field) => {
              const maxFiles = field.maxFiles ?? 1;
              const count = attachmentCount(field.name);
              const full = count >= maxFiles;
              return (
                <label
                  key={field.name}
                  className={`chat-attach-button${full ? " disabled" : ""}`}
                  title={
                    field.accept === undefined ? undefined : `Formats : ${field.accept.join(", ")}`
                  }
                >
                  {uploadingField === field.name
                    ? "Envoi…"
                    : `Joindre ${field.label}${maxFiles > 1 ? ` (${count}/${maxFiles})` : ""}`}
                  <input
                    className="sr-only"
                    type="file"
                    accept={field.accept?.join(",")}
                    multiple={maxFiles > 1}
                    disabled={full || uploadingField !== null || pending || finishing}
                    onChange={(event) => onFiles(event, field)}
                  />
                </label>
              );
            })}
          </div>
        ) : null}

        {pendingAttachments.length > 0 ? (
          <ul className="chat-pending-attachments">
            {pendingAttachments.map((attachment) => (
              <li key={attachment.id}>
                <span>
                  {attachment.fieldLabel} — {attachment.originalName}
                </span>
                <button
                  type="button"
                  onClick={() => void removePendingAttachment(attachment)}
                  aria-label={`Retirer ${attachment.originalName}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

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
