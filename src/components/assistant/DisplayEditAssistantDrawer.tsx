"use client";

import { useEffect, useRef, useState } from "react";
import type { TemplateEditExecutionEvent } from "@/application/use-cases/visual-templates/template-edit-events";
import { Modal } from "@/components/ui/Modal";
import type { TemplateEditSession } from "@/domain/template-edit-session";
import type { TemplateEditCandidate } from "@/domain/template-edit-target";
import type { TemplateParamValues } from "@/domain/template-params";
import type { DisplayAssistantContext } from "./DisplayAssistantProvider";
import { ExecutionTimeline } from "./ExecutionTimeline";
import { PlanProposal } from "./PlanProposal";

type SendResponse = { session: TemplateEditSession };
type ApplyResponse = { session: TemplateEditSession; values: TemplateParamValues };
type ErrorResponse = { error?: string };

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & ErrorResponse;
  if (!response.ok) throw new Error(json.error ?? "Une erreur est survenue");
  return json;
}

function targetKey(candidate: TemplateEditCandidate): string {
  return `${candidate.collection}:${candidate.itemId}`;
}

export function DisplayEditAssistantDrawer({
  context,
  onClose,
}: {
  context: DisplayAssistantContext;
  onClose: () => void;
}) {
  const [session, setSession] = useState<TemplateEditSession | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<TemplateEditExecutionEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const applyRef = useRef(context.onApply);
  applyRef.current = context.onApply;
  const paramsRef = useRef(context.params);
  paramsRef.current = context.params;
  const base = `/api/links/${context.linkId}/ai-edit/sessions`;

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surface: context.surface, params: paramsRef.current }),
    })
      .then(readJson<SendResponse>)
      .then((json) => {
        if (!cancelled) {
          setSession(json.session);
          applyRef.current(json.session.state.workingParams);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Session indisponible");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [base, context.surface]);

  const messageCount = session?.state.messages.length ?? 0;
  useEffect(() => {
    if (messageCount === 0) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messageCount]);

  const send = async (message: string): Promise<void> => {
    if (session === null || busy || message.trim() === "") return;
    setBusy(true);
    setError(null);
    setEvents([]);
    try {
      const response = await fetch(`${base}/${session.id}/messages/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          params: context.params,
          selection: context.selectedRegion,
          surface: context.surface,
        }),
      });
      if (!response.ok || response.body === null) {
        const json = (await response.json().catch(() => ({}))) as ErrorResponse;
        throw new Error(json.error ?? "Flux d’édition indisponible");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalSession: TemplateEditSession | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf("\n\n");
        while (split >= 0) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          let eventName = "message";
          let data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (data !== "") {
            const parsed = JSON.parse(data) as unknown;
            if (eventName === "step") {
              setEvents((current) => [...current, parsed as TemplateEditExecutionEvent]);
            } else if (eventName === "session") {
              finalSession = parsed as TemplateEditSession;
            } else if (eventName === "error") {
              const err = parsed as ErrorResponse;
              throw new Error(err.error ?? "Erreur d’édition");
            }
          }
          split = buffer.indexOf("\n\n");
        }
      }
      if (finalSession === null) throw new Error("Session finale absente");
      setSession(finalSession);
      setInput("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Réponse indisponible");
    } finally {
      setBusy(false);
    }
  };

  const chooseCandidate = (candidate: TemplateEditCandidate): void => {
    void send(`Je veux modifier « ${candidate.label} »`);
  };

  const apply = async (): Promise<void> => {
    if (session === null || applying) return;
    setApplying(true);
    setError(null);
    try {
      const json = await readJson<ApplyResponse>(
        await fetch(`${base}/${session.id}/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params: context.params, surface: context.surface }),
        }),
      );
      context.onApply(json.values);
      setSession(json.session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Application impossible");
    } finally {
      setApplying(false);
    }
  };

  const save = async (): Promise<void> => {
    if (saving || session === null) return;
    setSaving(true);
    setError(null);
    try {
      await context.onSave();
      await fetch(`${base}/${session.id}/saved`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params: context.params, surface: context.surface }),
      }).catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const copyAudit = async (): Promise<void> => {
    if (session === null || copying) return;
    setCopying(true);
    setError(null);
    try {
      const json = await readJson<{ sessionId: string; events: unknown[] }>(
        await fetch(`${base}/${session.id}/audit`),
      );
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Copie impossible");
    } finally {
      setCopying(false);
    }
  };

  const restart = async (): Promise<void> => {
    if (session === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await fetch(`${base}/${session.id}`, { method: "DELETE" });
      const json = await readJson<SendResponse>(
        await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ surface: context.surface, params: paramsRef.current }),
        }),
      );
      setSession(json.session);
      setEvents([]);
      setInput("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Réinitialisation impossible");
    } finally {
      setBusy(false);
    }
  };

  const messages = session?.state.messages ?? [];
  const lastProposalMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.proposal !== undefined);

  return (
    <Modal
      title="Assistante ONIR"
      onClose={onClose}
      overlayClassName="assistant-drawer-overlay"
      dialogClassName="display-assistant-drawer"
      bodyClassName="display-assistant-drawer-body"
    >
      {session === null ? (
        <p className="hint">
          {busy ? "Ouverture de la conversation…" : (error ?? "Session indisponible.")}
        </p>
      ) : (
        <div className="display-assistant-chat">
          <div className="display-assistant-chat-head">
            <span className="hint">
              {context.surface === "page" ? "Page" : "Widget"} ·{" "}
              {session.state.workingParams === undefined ? "" : "brouillon"}
            </span>
            <div className="display-assistant-head-actions">
              <button
                type="button"
                className="btn ghost small"
                disabled={copying}
                onClick={() => void copyAudit()}
              >
                {copied ? "Copié" : copying ? "Copie…" : "Copier l’audit"}
              </button>
              <button type="button" className="btn ghost small" onClick={() => void restart()}>
                Nouvelle conversation
              </button>
            </div>
          </div>
          <ExecutionTimeline events={events} />
          <div className="display-assistant-messages" ref={scrollRef}>
            {messages.map((message) => (
              <div key={message.id} className={`display-assistant-message ${message.role}`}>
                {message.role === "assistant" ? (
                  <span className="display-assistant-avatar">✦</span>
                ) : null}
                <div>{message.content}</div>
              </div>
            ))}
            {session.state.pendingProposal === null ||
            lastProposalMessage?.proposal === undefined ? null : (
              <PlanProposal
                proposal={lastProposalMessage.proposal}
                candidate={lastProposalMessage.candidate}
                applying={applying}
                onApply={() => void apply()}
                onCancel={() => setInput("")}
              />
            )}
            {messages.at(-1)?.candidates === undefined ? null : (
              <div className="display-assistant-choices">
                {messages.at(-1)?.candidates?.map((candidate) => (
                  <button
                    key={targetKey(candidate)}
                    type="button"
                    className="btn ghost small"
                    onClick={() => chooseCandidate(candidate)}
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            )}
            {busy ? <div className="hint">L’assistante réfléchit…</div> : null}
          </div>
          {error === null ? null : <p className="alert error">{error}</p>}
          <form
            className="display-assistant-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <textarea
              rows={2}
              value={input}
              placeholder="Ex. change le fond du bouton discuter"
              onChange={(event) => setInput(event.target.value)}
            />
            <button type="submit" className="btn small" disabled={busy || input.trim() === ""}>
              Envoyer
            </button>
          </form>
          <div className="display-assistant-save">
            <button
              type="button"
              className="btn small"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
