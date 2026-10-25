"use client";

import { useRouter } from "next/navigation";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { AiProviderModel } from "@/domain/entities/ai-model";

type TestMessage = { id: string; role: "user" | "assistant"; content: string };

export type AiTestProvider = {
  id: string;
  label: string;
  preset: string;
  defaultModel: string | null;
};

/** Console de test d'un modèle : chat éphémère, scroll interne, rendu Markdown. */
export function AiTestConsole({
  providers,
  initialProviderId,
  initialModelRowId,
}: {
  providers: AiTestProvider[];
  initialProviderId: string | null;
  initialModelRowId: string | null;
}) {
  const router = useRouter();
  const [providerId, setProviderId] = useState(initialProviderId ?? providers[0]?.id ?? "");
  const [models, setModels] = useState<AiProviderModel[]>([]);
  const [modelRowId, setModelRowId] = useState(initialModelRowId ?? "");
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (providerId === "") {
      setModels([]);
      setModelRowId("");
      return;
    }
    let cancelled = false;
    void fetch(`/api/ai/providers/${providerId}/models?enabled=1`)
      .then(async (response) => {
        const json = (await response.json()) as {
          items?: AiProviderModel[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setModels([]);
          setModelRowId("");
          setError(json.error ?? "Chargement des modèles impossible");
          return;
        }
        const list = json.items ?? [];
        setModels(list);
        setModelRowId((current) =>
          list.some((model) => model.id === current) ? current : (list[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setModels([]);
          setModelRowId("");
          setError("Chargement des modèles impossible");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  useEffect(() => {
    if (providerId === "") return;
    const query = new URLSearchParams({ provider: providerId });
    if (modelRowId !== "") query.set("model", modelRowId);
    router.replace(`/parametres/ia/test?${query.toString()}`, { scroll: false });
  }, [providerId, modelRowId, router]);

  useEffect(() => {
    if (messages.length === 0 && !pending) return;
    if (!stickRef.current) return;
    const element = logRef.current;
    if (element === null) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const selectedModel = models.find((model) => model.id === modelRowId) ?? null;

  const resetConversation = (): void => {
    setMessages([]);
    setError(null);
    setLatency(null);
    stickRef.current = true;
  };

  const send = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const content = input.trim();
    if (content === "" || pending || selectedModel === null) return;
    const next = [...messages, { id: crypto.randomUUID(), role: "user" as const, content }];
    stickRef.current = true;
    setMessages(next);
    setInput("");
    if (inputRef.current !== null) inputRef.current.style.height = "auto";
    setPending(true);
    setError(null);
    setLatency(null);
    try {
      const response = await fetch(
        `/api/ai/providers/${providerId}/models/${selectedModel.id}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.map(({ role, content: value }) => ({ role, content: value })),
            maxTokens: 800,
          }),
        },
      );
      const json = (await response.json()) as {
        ok?: boolean;
        response?: string;
        latencyMs?: number;
        error?: string;
      };
      if (!response.ok) {
        setError(json.error ?? "Test impossible");
        return;
      }
      if (json.ok !== true) {
        setError(json.error ?? "Le modèle n'a pas répondu");
        return;
      }
      setLatency(json.latencyMs ?? null);
      setMessages([
        ...next,
        { id: crypto.randomUUID(), role: "assistant", content: json.response ?? "" },
      ]);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    formRef.current?.requestSubmit();
  };

  const copy = async (message: TestMessage): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId((id) => (id === message.id ? null : id)), 2000);
    } catch {
      setError("Copie impossible");
    }
  };

  return (
    <div className={`ai-test-shell${fullscreen ? " is-fullscreen" : ""}`}>
      <div className="ai-test-controls">
        <div className="ai-test-toolbar">
          <a className="btn ghost small" href="/parametres/ia">
            ← Fournisseurs
          </a>
          <h1 className="ai-test-title">Test IA</h1>
          <label className="field ai-test-field">
            Fournisseur
            <select
              value={providerId}
              onChange={(event) => {
                setProviderId(event.target.value);
                setModelRowId("");
                resetConversation();
              }}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field ai-test-field">
            Modèle
            <select
              value={modelRowId}
              disabled={models.length === 0}
              onChange={(event) => {
                setModelRowId(event.target.value);
                resetConversation();
              }}
            >
              {models.length === 0 ? <option value="">Aucun modèle actif</option> : null}
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          {latency !== null ? <span className="hint ai-test-latency">{latency} ms</span> : null}
          <button
            type="button"
            className="btn ghost small"
            aria-pressed={fullscreen}
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? "Réduire" : "Plein écran"}
          </button>
        </div>
        {error !== null ? <p className="alert error">{error}</p> : null}
      </div>

      <div className="chat">
        <div
          className="chat-log"
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label="Conversation de test"
          onScroll={() => {
            const element = logRef.current;
            if (element === null) return;
            stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }}
        >
          {messages.length === 0 ? (
            <p className="chat-intro">
              Choisissez un modèle puis envoyez un message pour tester le rendu Markdown.
            </p>
          ) : null}
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
                      <button
                        type="button"
                        className="btn ghost small ai-test-copy"
                        onClick={() => void copy(message)}
                      >
                        {copiedId === message.id ? "Copié !" : "Copier le Markdown"}
                      </button>
                    </div>
                  ) : (
                    <p className="bubble">{message.content}</p>
                  )}
                </div>
              </li>
            ))}
            {pending ? (
              <li className="msg assistant">
                <span className="msg-avatar" aria-hidden="true">
                  IA
                </span>
                <div className="msg-body">
                  <div className="bubble">
                    <span className="typing" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                </div>
              </li>
            ) : null}
          </ul>
        </div>

        <form className="chat-composer" onSubmit={send} ref={formRef} noValidate>
          <div className="chat-composer-inner">
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              value={input}
              aria-label="Message de test"
              placeholder={
                selectedModel === null
                  ? "Aucun modèle actif pour ce fournisseur"
                  : "Pose une question au modèle…"
              }
              disabled={selectedModel === null || pending}
              onChange={(event) => {
                setInput(event.target.value);
                const element = event.currentTarget;
                element.style.height = "auto";
                element.style.height = `${Math.min(element.scrollHeight, 144)}px`;
              }}
              onKeyDown={onKeyDown}
            />
            <div className="chat-actions">
              <button
                type="button"
                className="btn ghost small"
                disabled={messages.length === 0 || pending}
                onClick={resetConversation}
              >
                Vider
              </button>
              <button
                type="submit"
                className="chat-send"
                aria-label="Envoyer"
                disabled={pending || input.trim() === "" || selectedModel === null}
              >
                ↑
              </button>
            </div>
          </div>
          <p className="chat-composer-hint">
            Entrée pour envoyer · Maj+Entrée pour un saut de ligne
          </p>
        </form>
      </div>
    </div>
  );
}
