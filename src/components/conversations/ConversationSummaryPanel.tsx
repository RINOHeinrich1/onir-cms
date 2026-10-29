"use client";

import { useEffect, useState } from "react";
import { AiModelSelect } from "@/components/ai/AiModelSelect";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { OPEN_CONVERSATION_SUMMARY_EVENT } from "./conversation-events";

type SummaryDto = {
  id: string;
  content: string;
  provider: string;
  model: string;
  tokensUsed: number;
  sourceMessageCount: number;
  sourceLastMessageAt: string | null;
  generatedWhileFinalized: boolean;
  generatedAt: string;
  updatedAt: string;
};

type ProviderOption = {
  id: string;
  label: string;
  defaultModel: string | null;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("fr-FR");
}

/** Panneau dédié au résumé manuel, indépendant du panneau d'informations (ADR-0054). */
export function ConversationSummaryPanel({
  conversationId,
  canSummarize,
  canChooseModel,
  finalized,
}: {
  conversationId: string;
  canSummarize: boolean;
  canChooseModel: boolean;
  finalized: boolean;
}) {
  const toast = useToast();
  const [summary, setSummary] = useState<SummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/conversations/${conversationId}/summary`, { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json()) as { summary?: SummaryDto | null; error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setError(json.error ?? "Impossible de charger le résumé");
          return;
        }
        setSummary(json.summary ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger le résumé");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    const open = (): void => setDrawerOpen(true);
    if (new URLSearchParams(window.location.search).get("panel") === "summary") open();
    window.addEventListener(OPEN_CONVERSATION_SUMMARY_EVENT, open);
    return () => window.removeEventListener(OPEN_CONVERSATION_SUMMARY_EVENT, open);
  }, []);

  useEffect(() => {
    if (!modalOpen || !canChooseModel || providers.length > 0) return;
    let cancelled = false;
    setProvidersLoading(true);
    void fetch("/api/ai/providers", { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json()) as {
          providers?: ProviderOption[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setError(json.error ?? "Impossible de charger les fournisseurs IA");
          return;
        }
        const list = json.providers ?? [];
        setProviders(list);
        const first = list[0];
        if (first !== undefined) {
          setProviderId((current) => current || first.id);
          setModel((current) => current || first.defaultModel || "");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les fournisseurs IA");
      })
      .finally(() => {
        if (!cancelled) setProvidersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canChooseModel, modalOpen, providers.length]);

  const start = (): void => {
    setError(null);
    setCustomModel(false);
    setModalOpen(true);
  };

  const generate = async (): Promise<void> => {
    if (customModel && (providerId === "" || model.trim() === "")) {
      setError("Choisissez un fournisseur et un modèle");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customModel ? { providerId, model: model.trim() } : {}),
      });
      const json = (await response.json()) as { summary?: SummaryDto; error?: string };
      if (!response.ok || json.summary === undefined) {
        setError(json.error ?? "Génération du résumé impossible");
        return;
      }
      setSummary(json.summary);
      setModalOpen(false);
      toast.success("Résumé de la conversation enregistré.");
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const partial = summary !== null && (!summary.generatedWhileFinalized || !finalized);
  const meta =
    summary === null ? "" : [summary.provider, summary.model].filter(Boolean).join(" · ");

  return (
    <>
      {drawerOpen ? (
        <>
          <button
            type="button"
            className="conversation-summary-backdrop"
            aria-label="Fermer le résumé"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="conversation-summary-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Résumé de la conversation"
          >
            <div className="conversation-info-head">
              <div>
                <span className="eyebrow">Conversation</span>
                <h2>Résumé</h2>
              </div>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div className="conversation-summary-body">
              {loading ? (
                <p className="hint">Chargement du résumé…</p>
              ) : (
                <section className="conversation-summary" aria-label="Résumé de la conversation">
                  <div className="conversation-summary-head">
                    <div>
                      <h4>Résumé de la conversation</h4>
                      {summary === null ? (
                        <p className="hint">
                          Aucun résumé. Génère-le à la demande pour garder le contexte.
                        </p>
                      ) : (
                        <p className="hint">
                          {partial ? "Résumé partiel" : "Résumé final"} ·{" "}
                          {summary.sourceMessageCount} message
                          {summary.sourceMessageCount > 1 ? "s" : ""} ·{" "}
                          {formatDate(summary.updatedAt)}
                        </p>
                      )}
                    </div>
                    {canSummarize ? (
                      <button type="button" className="btn ghost small" onClick={start}>
                        {summary === null ? "Résumer" : "Régénérer"}
                      </button>
                    ) : null}
                  </div>

                  {summary === null ? (
                    canSummarize ? null : (
                      <p className="hint">Aucun résumé disponible pour cette conversation.</p>
                    )
                  ) : (
                    <>
                      <p className="conversation-summary-content">{summary.content}</p>
                      {meta === "" ? null : (
                        <p className="conversation-summary-meta">Modèle : {meta}</p>
                      )}
                    </>
                  )}
                  {error !== null && summary === null ? (
                    <p className="alert error">{error}</p>
                  ) : null}
                </section>
              )}
            </div>
          </aside>
        </>
      ) : null}

      {modalOpen ? (
        <Modal
          title={summary === null ? "Résumer la conversation" : "Régénérer le résumé"}
          onClose={() => {
            if (!pending) setModalOpen(false);
          }}
        >
          <p className="hint">
            {summary === null
              ? "Un résumé factuel de la conversation sera généré avec le modèle du chatbot."
              : "Le résumé actuel sera écrasé. Cette action est utile si le résumé est insuffisant ou pour essayer un autre modèle."}
          </p>

          {canChooseModel ? (
            <div className="conversation-summary-model">
              <label className="check">
                <input
                  type="checkbox"
                  checked={customModel}
                  disabled={pending}
                  onChange={(event) => setCustomModel(event.target.checked)}
                />
                Choisir un autre modèle
              </label>
              {customModel ? (
                <>
                  <label className="field">
                    Fournisseur
                    <select
                      value={providerId}
                      disabled={pending || providersLoading}
                      onChange={(event) => {
                        const next = event.target.value;
                        setProviderId(next);
                        const selected = providers.find((provider) => provider.id === next);
                        setModel(selected?.defaultModel ?? "");
                      }}
                    >
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="field">
                    <span>Modèle</span>
                    <AiModelSelect
                      providerId={providerId === "" ? null : providerId}
                      value={model}
                      disabled={pending}
                      onChange={setModel}
                    />
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {error !== null ? <p className="alert error">{error}</p> : null}

          <div className="tools">
            <button
              type="button"
              className="btn ghost"
              disabled={pending}
              onClick={() => setModalOpen(false)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => void generate()}
            >
              {pending ? "Génération…" : summary === null ? "Générer le résumé" : "Régénérer"}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
