"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import type { Conversation, ConversationInterventionMode } from "@/domain/entities/chat";
import { ConversationTranscript } from "./ConversationTranscript";
import type { ChatMessageDto } from "./types";

type ConversationState = Pick<
  Conversation,
  | "id"
  | "interventionMode"
  | "assignedOperatorName"
  | "lastOperatorName"
  | "lastVisitorMessageAt"
  | "lastOperatorMessageAt"
  | "statut"
>;

type ApiState = {
  conversation?: ConversationState;
  awaitingOperator?: boolean;
  mode?: ConversationInterventionMode;
  messages?: ChatMessageDto[];
  error?: string;
};

const POLL_MS = 4000;

function mergeMessages(current: ChatMessageDto[], incoming: ChatMessageDto[]): ChatMessageDto[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
}

function isAwaiting(state: ConversationState): boolean {
  if (state.interventionMode !== "human" || state.lastVisitorMessageAt === null) return false;
  return (
    state.lastOperatorMessageAt === null || state.lastVisitorMessageAt > state.lastOperatorMessageAt
  );
}

/**
 * Fil temps réel d'une conversation côté backoffice (ADR-0043).
 * SSE en nominal, polling 4 s en secours ; composeur réservé aux rôles autorisés.
 */
export function ConversationLive({
  conversation: initialConversation,
  initialMessages,
  canIntervene,
  assistantLabel = "Assistant IA",
}: {
  conversation: ConversationState;
  initialMessages: ChatMessageDto[];
  canIntervene: boolean;
  assistantLabel?: string;
}) {
  const toast = useToast();
  const [conversation, setConversation] = useState<ConversationState>(initialConversation);
  const [messages, setMessages] = useState<ChatMessageDto[]>(initialMessages);
  const [transport, setTransport] = useState<"sse" | "polling">("sse");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const lastAtRef = useRef<string | null>(
    initialMessages.length === 0
      ? null
      : (initialMessages[initialMessages.length - 1]?.createdAt ?? null),
  );
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const firstScrollRef = useRef(true);
  const pageAnchoredRef = useRef(false);
  const [newBelow, setNewBelow] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto"): void => {
    const element = transcriptRef.current;
    if (element === null) return;
    if (behavior === "smooth") {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    } else {
      element.scrollTop = element.scrollHeight;
    }
    stickToBottomRef.current = true;
    setNewBelow(false);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: déclenche l'ancrage à chaque nouveau message
  useLayoutEffect(() => {
    const element = transcriptRef.current;
    if (element === null) return;
    const first = firstScrollRef.current;
    const scroll = (): void => {
      if (first) {
        firstScrollRef.current = false;
        stickToBottomRef.current = true;
        setNewBelow(false);
        if (!pageAnchoredRef.current) {
          pageAnchoredRef.current = true;
          const inInbox = element.closest(".inbox-thread") !== null;
          if (!inInbox && new URLSearchParams(window.location.search).get("alert") === null) {
            const scrollPage = (): void => {
              window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
            };
            window.requestAnimationFrame(() => window.requestAnimationFrame(scrollPage));
            window.setTimeout(scrollPage, 350);
          }
        }
      }
      if (stickToBottomRef.current) {
        element.scrollTop = element.scrollHeight;
        setNewBelow(false);
      } else {
        setNewBelow(true);
      }
    };
    scroll();
    const frame = window.requestAnimationFrame(scroll);
    return () => window.cancelAnimationFrame(frame);
  }, [messages]);

  const applyConversation = useCallback((next: ConversationState): void => {
    setConversation(next);
  }, []);

  const receiveMessages = useCallback((incoming: ChatMessageDto[]): void => {
    if (incoming.length === 0) return;
    setMessages((current) => mergeMessages(current, incoming));
    const latest = incoming[incoming.length - 1];
    if (
      latest !== undefined &&
      (lastAtRef.current === null || latest.createdAt > lastAtRef.current)
    ) {
      lastAtRef.current = latest.createdAt;
    }
  }, []);

  // Après le calcul de hauteur du flex, on force l'ancrage bas à l'ouverture.
  // biome-ignore lint/correctness/useExhaustiveDependencies: l'ancrage doit être refait à chaque conversation
  useEffect(() => {
    const element = transcriptRef.current;
    if (element === null) return;
    stickToBottomRef.current = true;
    const scroll = (): void => {
      if (stickToBottomRef.current) element.scrollTop = element.scrollHeight;
    };
    const frame = window.requestAnimationFrame(scroll);
    const timer = window.setTimeout(scroll, 120);
    const observer = new ResizeObserver(scroll);
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [initialConversation.id]);

  // SSE nominal : dès qu'il échoue, on ferme et on bascule en polling.
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      setTransport("polling");
      return;
    }
    const params = new URLSearchParams();
    if (lastAtRef.current !== null) params.set("after", lastAtRef.current);
    const source = new EventSource(
      `/api/conversations/${encodeURIComponent(initialConversation.id)}/stream?${params.toString()}`,
    );
    let closed = false;

    const onMessage = (event: MessageEvent<string>): void => {
      try {
        receiveMessages([JSON.parse(event.data) as ChatMessageDto]);
      } catch {
        // Trame illisible : le polling corrigera l'état.
      }
    };
    const onState = (event: MessageEvent<string>): void => {
      try {
        const payload = JSON.parse(event.data) as {
          conversation?: ConversationState;
        };
        if (payload.conversation !== undefined) applyConversation(payload.conversation);
      } catch {
        // Trame illisible.
      }
    };
    const onOpen = (): void => setTransport("sse");
    const onError = (): void => {
      if (closed) return;
      closed = true;
      source.close();
      setTransport("polling");
    };

    source.addEventListener("open", onOpen);
    source.addEventListener("message", onMessage as EventListener);
    source.addEventListener("state", onState as EventListener);
    source.addEventListener("error", onError);

    return () => {
      closed = true;
      source.close();
    };
  }, [initialConversation.id, applyConversation, receiveMessages]);

  // Repli polling : utilisé si SSE échoue ou si EventSource est indisponible.
  useEffect(() => {
    if (transport !== "polling") return;
    let cancelled = false;

    const poll = async (): Promise<void> => {
      if (document.visibilityState === "hidden") return;
      const params = new URLSearchParams();
      if (lastAtRef.current !== null) params.set("after", lastAtRef.current);
      try {
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(initialConversation.id)}/messages?${params.toString()}`,
          { cache: "no-store" },
        );
        const json = (await response.json()) as ApiState;
        if (cancelled || !response.ok) return;
        if (json.messages !== undefined) receiveMessages(json.messages);
        if (json.conversation !== undefined) applyConversation(json.conversation);
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
  }, [transport, initialConversation.id, applyConversation, receiveMessages]);

  const send = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const content = draft.trim();
    if (content === "" || pending || conversation.statut === "finalisee") return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      const json = (await response.json()) as ApiState & { message?: ChatMessageDto };
      if (!response.ok || json.message === undefined || json.conversation === undefined) {
        setError(json.error ?? "Envoi impossible");
        return;
      }
      stickToBottomRef.current = true;
      receiveMessages([json.message]);
      applyConversation(json.conversation);
      setDraft("");
      toast.success("Message envoyé au visiteur.");
      draftRef.current?.focus();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const changeMode = async (action: "takeover" | "release"): Promise<void> => {
    if (actionPending) return;
    setActionPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/${action}`,
        { method: "POST" },
      );
      const json = (await response.json()) as ApiState;
      if (!response.ok || json.conversation === undefined) {
        setError(json.error ?? "Action impossible");
        return;
      }
      applyConversation(json.conversation);
      toast.success(action === "takeover" ? "Conversation prise en main." : "IA réactivée.");
      if (action === "takeover") draftRef.current?.focus();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setActionPending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const operatorName = conversation.assignedOperatorName ?? conversation.lastOperatorName;
  const awaiting = isAwaiting(conversation);
  const finalisee = conversation.statut === "finalisee";

  return (
    <>
      <div className="conversation-status">
        {conversation.interventionMode === "human" ? (
          <span className="badge orange">Humain</span>
        ) : (
          <span className="badge">IA</span>
        )}
        {operatorName !== null ? (
          <span className="badge muted">Opérateur : {operatorName}</span>
        ) : null}
        {awaiting ? <span className="badge orange">À répondre</span> : null}
        {!canIntervene ? <span className="badge muted">Lecture seule</span> : null}
        {transport === "polling" ? (
          <span className="hint">Actualisation toutes les 4 s</span>
        ) : null}
      </div>

      <div
        className="transcript-scroll"
        ref={transcriptRef}
        onScroll={() => {
          const element = transcriptRef.current;
          if (element === null) return;
          const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          stickToBottomRef.current = atBottom;
          if (atBottom) setNewBelow(false);
        }}
      >
        <ConversationTranscript messages={messages} assistantLabel={assistantLabel} />
      </div>

      {newBelow ? (
        <button type="button" className="chat-jump" onClick={() => scrollToBottom("smooth")}>
          Nouveau message ↓
        </button>
      ) : null}

      {error !== null ? <p className="alert error">{error}</p> : null}

      {finalisee ? (
        <p className="hint">Conversation finalisée : la saisie est désactivée.</p>
      ) : canIntervene ? (
        <form className="conversation-composer" onSubmit={send}>
          <textarea
            ref={draftRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              conversation.interventionMode === "human"
                ? "Répondre au visiteur…"
                : "Prendre la main et répondre au visiteur…"
            }
            rows={3}
            maxLength={4000}
            disabled={pending}
          />
          <div className="conversation-composer-actions">
            <button type="submit" className="btn small" disabled={pending || draft.trim() === ""}>
              {pending ? "Envoi…" : "Envoyer"}
            </button>
            {conversation.interventionMode === "human" ? (
              <button
                type="button"
                className="btn ghost small"
                disabled={actionPending}
                onClick={() => void changeMode("release")}
              >
                Rendre à l&apos;IA
              </button>
            ) : (
              <button
                type="button"
                className="btn ghost small"
                disabled={actionPending}
                onClick={() => void changeMode("takeover")}
              >
                Prendre la main
              </button>
            )}
          </div>
        </form>
      ) : null}
    </>
  );
}
