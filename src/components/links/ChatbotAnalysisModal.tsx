"use client";

import { Modal } from "@/components/ui/Modal";
import { channelsForLink, chatLinkBlockReason, chatLinkQuota } from "@/domain/entities/chat";
import type { AiProviderOption, ChatLinkRow } from "./types";

function formatDate(value: string | null): string {
  return value === null ? "—" : new Date(value).toLocaleDateString("fr-FR");
}

function percent(value: number, max: number | null): number {
  if (max === null) return 0;
  if (max === 0) return 100;
  return Math.min(100, Math.round((value / max) * 100));
}

/** Analyse détaillée d'un chatbot, sortie volontairement de la carte. */
export function ChatbotAnalysisModal({
  link,
  aiProviders,
  nowIso,
  onClose,
  onCopy,
  onPreview,
  onRegenerate,
  onConversations,
  onLeads,
  onEdit,
}: {
  link: ChatLinkRow;
  aiProviders: AiProviderOption[];
  nowIso: string;
  onClose: () => void;
  onCopy: () => void;
  onPreview: () => void;
  onRegenerate: () => void;
  onConversations: () => void;
  onLeads: () => void;
  onEdit: () => void;
}) {
  const expired =
    link.expiresAt !== null && new Date(link.expiresAt).getTime() <= new Date(nowIso).getTime();
  const blockReason = chatLinkBlockReason(link);
  const quota = chatLinkQuota(link);
  const channels = channelsForLink(link);
  const provider =
    link.aiProviderId === null
      ? "Défaut organisation"
      : (aiProviders.find((entry) => entry.id === link.aiProviderId)?.label ??
        "Fournisseur indisponible");
  const status = expired
    ? { label: "Expiré", className: "warn" }
    : blockReason !== null
      ? { label: "Bloqué", className: "warn" }
      : link.actif
        ? { label: "Actif", className: "success" }
        : { label: "Révoqué", className: "muted" };
  const initial = (link.label.trim() || "?").slice(0, 1).toLocaleUpperCase("fr");

  return (
    <Modal
      title="Analyse du chatbot"
      onClose={onClose}
      wide
      dialogClassName="chatbot-analysis-modal"
      bodyClassName="chatbot-analysis-body"
    >
      <section className="chatbot-analysis-hero">
        <span className="chatbot-analysis-mark" aria-hidden="true">
          {initial}
        </span>
        <div className="chatbot-analysis-identity">
          <h2>{link.label === "" ? "Chatbot sans nom" : link.label}</h2>
          <p className="chatbot-analysis-creator">
            <svg
              className="chatbot-analysis-creator-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="3.2" />
              <path d="M5.5 19c.8-3.1 3.2-4.8 6.5-4.8s5.7 1.7 6.5 4.8" />
            </svg>
            <strong>{link.createdByLabel ?? "Créateur non renseigné"}</strong>
          </p>
          <div className="chatbot-analysis-badges">
            <span className={`badge ${status.className}`}>{status.label}</span>
            <span className="badge muted">
              {link.type === "standard" ? "Standard" : "Spécifique"}
            </span>
            {channels.page.enabled ? <span className="badge muted">Page</span> : null}
            {channels.widget.enabled ? <span className="badge orange">Widget</span> : null}
          </div>
        </div>
      </section>

      <section className="chatbot-analysis-kpis" aria-label="Indicateurs du chatbot">
        <article>
          <span>Visites</span>
          <strong>{link.visitCount}</strong>
          <small>
            {link.lastVisitAt === null
              ? "Aucune visite"
              : `Dernière ${formatDate(link.lastVisitAt)}`}
          </small>
        </article>
        <article>
          <span>Fiches générées</span>
          <strong>{quota.fichesGenerated}</strong>
          <small>{quota.maxFiches === null ? "Quota illimité" : `sur ${quota.maxFiches}`}</small>
        </article>
        <article>
          <span>Tokens utilisés</span>
          <strong>{quota.tokensUsed}</strong>
          <small>{quota.maxTokens === null ? "Quota illimité" : `sur ${quota.maxTokens}`}</small>
        </article>
        <article>
          <span>Expiration</span>
          <strong className="chatbot-analysis-date">{formatDate(link.expiresAt)}</strong>
          <small>{link.expiresAt === null ? "Sans expiration" : "Date limite"}</small>
        </article>
      </section>

      <section className="chatbot-analysis-section">
        <h4>Configuration</h4>
        <dl className="chatbot-analysis-grid">
          <div>
            <dt>Moteur IA</dt>
            <dd>
              {provider}
              {link.aiModel === null ? "" : ` · ${link.aiModel}`}
            </dd>
          </div>
          <div>
            <dt>Configuration chatbot</dt>
            <dd>
              {link.currentConfigId !== null && link.currentConfigId !== undefined
                ? "Chatbot autonome"
                : "Non configuré"}
            </dd>
          </div>
          <div>
            <dt>Identification</dt>
            <dd>
              {channels.page.enabled && channels.page.identificationMode === "anonymous"
                ? "Anonyme"
                : "Contact"}
            </dd>
          </div>
          <div>
            <dt>Créé le</dt>
            <dd>{formatDate(link.createdAt)}</dd>
          </div>
          <div>
            <dt>Dernière visite</dt>
            <dd>{formatDate(link.lastVisitAt)}</dd>
          </div>
          <div>
            <dt>Canaux</dt>
            <dd>
              {[channels.page.enabled ? "Page" : null, channels.widget.enabled ? "Widget" : null]
                .filter(Boolean)
                .join(" · ") || "Aucun canal actif"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="chatbot-analysis-section">
        <h4>Consommation</h4>
        <div className="chatbot-analysis-quotas">
          <div className="quota-line">
            <span>
              Fiches <strong>{quota.fichesGenerated}</strong>
              {quota.maxFiches === null ? " / ∞" : ` / ${quota.maxFiches}`}
            </span>
            <span className="quota-bar" aria-hidden>
              <span style={{ width: `${percent(quota.fichesGenerated, quota.maxFiches)}%` }} />
            </span>
          </div>
          <div className="quota-line">
            <span>
              Tokens <strong>{quota.tokensUsed}</strong>
              {quota.maxTokens === null ? " / ∞" : ` / ${quota.maxTokens}`}
            </span>
            <span className="quota-bar" aria-hidden>
              <span style={{ width: `${percent(quota.tokensUsed, quota.maxTokens)}%` }} />
            </span>
          </div>
        </div>
      </section>

      <section className="chatbot-analysis-section">
        <h4>Lien public</h4>
        {link.url === null ? (
          <div className="chatbot-analysis-url">
            <span>Lien non généré</span>
            <button type="button" className="btn small" onClick={onRegenerate}>
              Régénérer le lien
            </button>
          </div>
        ) : (
          <div className="chatbot-analysis-url">
            <code title={link.url}>{link.url}</code>
            <button type="button" className="btn ghost small" onClick={onCopy}>
              Copier
            </button>
            <button type="button" className="btn ghost small" onClick={onPreview}>
              Aperçu
            </button>
          </div>
        )}
      </section>

      <footer className="chatbot-analysis-actions">
        <button type="button" className="btn ghost small" onClick={onConversations}>
          Voir les conversations
        </button>
        <button type="button" className="btn ghost small" onClick={onLeads}>
          Voir les fiches associées
        </button>
        <button type="button" className="btn small" onClick={onEdit}>
          Modifier
        </button>
      </footer>
    </Modal>
  );
}
