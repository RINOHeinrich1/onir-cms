"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryPicker } from "@/components/categories/CategoryPicker";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import type { AiLinkTarget, AiLinkUsage } from "@/domain/entities/ai-usage";
import {
  type ChatLinkChannel,
  type ChatLinkSources,
  type ChatLinkSurface,
  channelsForLink,
  chatLinkQuota,
} from "@/domain/entities/chat";
import type { LinkAiValue } from "./AiAssignmentField";
import { AiUsageOverridesField } from "./AiUsageOverridesField";
import { ChatbotBehaviorFields } from "./ChatbotBehaviorFields";
import {
  type ChatbotConfigDraft,
  chatbotConfigPayload,
  draftFromConfig,
} from "./chatbot-config-draft";
import { type ChannelDrafts, channelApiPayload, LinkChannelsFields } from "./LinkChannelsFields";
import { LinkDataBindingsField } from "./LinkDataBindingsField";
import { type LinkQuotaDraft, LinkQuotaFields } from "./LinkQuotaFields";
import { SourcesField } from "./SourcesField";
import type {
  AiProviderOption,
  ChatLinkRow,
  ConfidentialiteOption,
  VisualTemplateOption,
} from "./types";
import { UserStateField } from "./UserStateField";
import {
  parseVisualTemplateSelection,
  widgetDisplayForSelection,
} from "./visual-template-selection";

function channelDraft(channel: ChatLinkChannel): ChannelDrafts["page"] {
  return {
    enabled: channel.enabled,
    identificationMode: channel.identificationMode,
    confidentialiteId: channel.confidentialiteId ?? "",
    visualTemplate:
      channel.visualTemplateId === null
        ? ""
        : `${channel.visualTemplateId}@${channel.visualTemplateVersion ?? ""}`,
    params: { ...channel.visualTemplateParams },
    widgetPosition: channel.widgetConfig.position ?? "bottom-right",
  };
}

const EDIT_STEPS = [
  { title: "Contexte & comportement", short: "Contexte" },
  { title: "Moteurs IA", short: "IA" },
  { title: "Diffusion", short: "Diffusion" },
  { title: "Récapitulatif", short: "Récapitulatif" },
] as const;

/**
 * Modale d'édition globale d'un lien : libellé + expiration (US-LIENS-001).
 * Date vide = sans expiration ; mêmes règles que la création.
 */
export function LinkEditModal({
  link,
  confidentialites,
  visualTemplates,
  aiProviders,
  canAssignAi,
  onSaved,
  onClose,
}: {
  link: ChatLinkRow;
  confidentialites: ConfidentialiteOption[];
  visualTemplates: VisualTemplateOption[];
  aiProviders: AiProviderOption[];
  canAssignAi: boolean;
  onSaved: (updated: ChatLinkRow) => void;
  onClose: () => void;
}) {
  const initialChannels = channelsForLink(link);
  const initialQuota = chatLinkQuota(link);
  const [label, setLabel] = useState(link.label);
  const [channels, setChannels] = useState<ChannelDrafts>({
    page: channelDraft(initialChannels.page),
    widget: channelDraft(initialChannels.widget),
  });
  const [activeChannel, setActiveChannel] = useState<ChatLinkSurface>(
    initialChannels.page.enabled || !initialChannels.widget.enabled ? "page" : "widget",
  );
  const [expiresAt, setExpiresAt] = useState(
    link.expiresAt === null ? "" : link.expiresAt.slice(0, 10),
  );
  const [sources, setSources] = useState<ChatLinkSources>({ ...link.sources });
  const [userStateEnabled, setUserStateEnabled] = useState<boolean>(link.userStateEnabled);
  const [quota, setQuota] = useState<LinkQuotaDraft>({
    maxFiches: initialQuota.maxFiches === null ? "" : String(initialQuota.maxFiches),
    maxTokens: initialQuota.maxTokens === null ? "" : String(initialQuota.maxTokens),
    tokenResetMode: initialQuota.tokenResetMode,
    tokenResetDays: initialQuota.tokenResetDays === null ? "" : String(initialQuota.tokenResetDays),
  });
  const [resetting, setResetting] = useState(false);
  const [dataBindings, setDataBindings] = useState<Record<string, string>>({});
  const [dataBindingsLoaded, setDataBindingsLoaded] = useState(false);
  const [ai] = useState<LinkAiValue>({
    aiProviderId: link.aiProviderId,
    aiModel: link.aiModel,
  });
  const [aiUsage, setAiUsage] = useState<Partial<Record<AiLinkUsage, AiLinkTarget>>>({});
  const [config, setConfig] = useState<ChatbotConfigDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const activeTemplate = parseVisualTemplateSelection(channels[activeChannel].visualTemplate);
  const widgetDisplay = widgetDisplayForSelection(visualTemplates, channels.widget.visualTemplate);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/links/${link.id}/data-bindings`)
      .then(async (response) =>
        response.ok ? ((await response.json()) as { dataBindings?: Record<string, string> }) : null,
      )
      .then((json) => {
        if (!cancelled && json?.dataBindings !== undefined) {
          setDataBindings(json.dataBindings);
          setDataBindingsLoaded(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [link.id]);

  useEffect(() => {
    if (link.currentConfigId === null || link.currentConfigId === undefined) return;
    let cancelled = false;
    void fetch(`/api/links/${link.id}/config`)
      .then(async (response) =>
        response.ok ? ((await response.json()) as { config?: unknown }) : null,
      )
      .then((json) => {
        if (cancelled || json === null) return;
        const draft = draftFromConfig(json.config);
        if (draft !== null) setConfig(draft);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [link.id, link.currentConfigId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const validateStep = (index: number): string | null => {
    if (index === 2) {
      if (!channels.page.enabled && !channels.widget.enabled) {
        return "Activez au moins un canal de diffusion.";
      }
      if (channels.widget.enabled && widgetDisplay === null) {
        return "Choisissez un template visuel compatible avec le widget.";
      }
    }
    return null;
  };

  const goToStep = (index: number): void => {
    setStep(index);
    setStepError(null);
  };

  const goNext = (): void => {
    const message = validateStep(step);
    if (message !== null) {
      setStepError(message);
      return;
    }
    if (step < EDIT_STEPS.length - 1) goToStep(step + 1);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (step < EDIT_STEPS.length - 1) {
      goNext();
      return;
    }
    for (let index = 0; index < EDIT_STEPS.length; index += 1) {
      const message = validateStep(index);
      if (message !== null) {
        setStep(index);
        setStepError(message);
        return;
      }
    }
    setStepError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          expiresAt,
          sources,
          userStateEnabled,
          maxFiches: quota.maxFiches === "" ? null : Number(quota.maxFiches),
          maxTokens: quota.maxTokens === "" ? null : Number(quota.maxTokens),
          tokenResetMode: quota.tokenResetMode,
          tokenResetDays:
            quota.tokenResetMode === "duration" && quota.tokenResetDays !== ""
              ? Number(quota.tokenResetDays)
              : null,
          aiProviderId: ai.aiProviderId,
          aiModel: ai.aiModel,
          channels: {
            page: channelApiPayload(channels.page),
            widget: channelApiPayload(channels.widget),
          },
          ...(dataBindingsLoaded ? { dataBindings } : {}),
          ...(config === null ? {} : { config: chatbotConfigPayload(config) }),
        }),
      });
      const json = (await response.json()) as { link?: ChatLinkRow; error?: string };
      if (!response.ok || json.link === undefined) {
        setError(json.error ?? "Modification impossible");
        return;
      }
      const aiResponse = await fetch(`/api/links/${link.id}/ai-usage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiUsage),
      });
      if (!aiResponse.ok) {
        toast.warning("Chatbot mis à jour, mais les moteurs IA n'ont pas pu être enregistrés.");
      }
      toast.success("Chatbot mis à jour.");
      onSaved(json.link);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const resetTokens = async (): Promise<void> => {
    setResetting(true);
    setError(null);
    try {
      const response = await fetch(`/api/links/${link.id}/tokens/reset`, { method: "POST" });
      const json = (await response.json()) as { link?: ChatLinkRow; error?: string };
      if (!response.ok || json.link === undefined) {
        setError(json.error ?? "Réinitialisation impossible");
        return;
      }
      toast.success("Budget tokens réinitialisé.");
      onSaved(json.link);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setResetting(false);
    }
  };

  const quotasSummary =
    quota.maxFiches === "" && quota.maxTokens === ""
      ? "Illimité"
      : [
          quota.maxFiches === "" ? "Fiches illimitées" : `${quota.maxFiches} fiche(s)`,
          quota.maxTokens === "" ? "Tokens illimités" : `${quota.maxTokens} token(s)`,
        ].join(" · ");

  return (
    <div className="modal-overlay chatbot-wizard-overlay">
      <button type="button" className="modal-backdrop" aria-label="Fermer" onClick={onClose} />
      <div
        className="modal wide chatbot-wizard-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Modifier le chatbot"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="modal-head">
          <h3>Modifier le chatbot</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body chatbot-wizard-host">
          <form className="chatbot-wizard" onSubmit={onSubmit} noValidate>
            <nav className="chatbot-wizard-stepper" aria-label="Étapes de modification">
              {EDIT_STEPS.map((entry, index) => (
                <button
                  key={entry.title}
                  type="button"
                  className={`chatbot-step${index === step ? " active" : ""}${index < step ? " done" : ""}`}
                  aria-current={index === step ? "step" : undefined}
                  disabled={pending}
                  onClick={() => goToStep(index)}
                >
                  <span className="chatbot-step-number">{index + 1}</span>
                  <span className="chatbot-step-label">
                    <span className="chatbot-step-title">{entry.title}</span>
                    <span className="chatbot-step-short">{entry.short}</span>
                  </span>
                </button>
              ))}
            </nav>

            <div className="chatbot-wizard-body">
              {stepError !== null ? <p className="alert error">{stepError}</p> : null}
              {error !== null ? <p className="alert error">{error}</p> : null}

              {step === 0 ? (
                <section className="chatbot-step-panel" aria-label={EDIT_STEPS[0].title}>
                  <div className="chatbot-step-head">
                    <h4>Contexte & comportement</h4>
                    <p className="hint">
                      Identité du chatbot, comportement, expiration et catégorie. Le type reste non
                      modifiable.
                    </p>
                  </div>
                  <p className="hint">
                    Type : <span className="badge">{link.type}</span>
                  </p>
                  <label className="field">
                    Libellé (optionnel)
                    <input
                      type="text"
                      placeholder="Ex. Salon IT, Stand, Campagne"
                      maxLength={120}
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Expiration (vide = sans expiration)
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={(event) => setExpiresAt(event.target.value)}
                    />
                    <span className="hint">
                      Le lien reste valide jusqu&apos;à la fin du jour choisi.
                    </span>
                  </label>
                  {config !== null ? (
                    <ChatbotBehaviorFields value={config} onChange={setConfig} />
                  ) : null}
                  <CategoryPicker contentType="link" contentId={link.id} />
                </section>
              ) : null}

              {step === 1 ? (
                <section className="chatbot-step-panel" aria-label={EDIT_STEPS[1].title}>
                  <div className="chatbot-step-head">
                    <h4>Moteurs IA</h4>
                    <p className="hint">
                      Choisissez les modèles ou clusters propres à ce chatbot pour chaque usage.
                    </p>
                  </div>
                  <AiUsageOverridesField
                    chatLinkId={link.id}
                    providers={aiProviders}
                    value={aiUsage}
                    onChange={setAiUsage}
                    canAssign={canAssignAi}
                  />
                </section>
              ) : null}

              {step === 2 ? (
                <section className="chatbot-step-panel" aria-label={EDIT_STEPS[2].title}>
                  <div className="chatbot-step-head">
                    <h4>Diffusion</h4>
                    <p className="hint">
                      Canaux, sources de réponse, état visiteur et bindings de données.
                    </p>
                  </div>
                  <LinkChannelsFields
                    value={channels}
                    onChange={setChannels}
                    active={activeChannel}
                    onActiveChange={setActiveChannel}
                    type={link.type}
                    visualTemplates={visualTemplates}
                    confidentialites={confidentialites}
                  />
                  <SourcesField value={sources} onChange={setSources} />
                  <UserStateField value={userStateEnabled} onChange={setUserStateEnabled} />
                  <LinkDataBindingsField
                    templateId={activeTemplate.id}
                    templateVersion={activeTemplate.version}
                    value={dataBindings}
                    onChange={setDataBindings}
                  />
                </section>
              ) : null}

              {step === 3 ? (
                <section className="chatbot-step-panel" aria-label={EDIT_STEPS[3].title}>
                  <div className="chatbot-step-head">
                    <h4>Récapitulatif</h4>
                    <p className="hint">Vérifiez les limites puis enregistrez les modifications.</p>
                  </div>
                  <LinkQuotaFields value={quota} onChange={setQuota} />
                  <div className="quota-summary">
                    <p className="hint">
                      Consommé : {initialQuota.fichesGenerated} fiche(s)
                      {initialQuota.maxFiches === null ? "" : ` / ${initialQuota.maxFiches}`} ·{" "}
                      {initialQuota.tokensUsed} token(s)
                      {initialQuota.maxTokens === null ? "" : ` / ${initialQuota.maxTokens}`}
                    </p>
                    <button
                      type="button"
                      className="btn ghost small"
                      disabled={resetting}
                      onClick={() => void resetTokens()}
                    >
                      {resetting ? "Réinitialisation…" : "Réinitialiser les tokens"}
                    </button>
                  </div>
                  <dl className="kv chatbot-summary">
                    <dt>Libellé</dt>
                    <dd>{label.trim() === "" ? "Sans libellé" : label}</dd>
                    <dt>Comportement</dt>
                    <dd>
                      {config === null
                        ? "—"
                        : config.behaviorMode === "guided"
                          ? "Guidé (prompt généré)"
                          : "Expert (prompt libre)"}
                    </dd>
                    <dt>Fiches</dt>
                    <dd>
                      {config === null || config.fiches.length === 0
                        ? "— Aucune —"
                        : config.fiches.map((fiche) => fiche.label || fiche.key).join(", ")}
                    </dd>
                    <dt>Canaux</dt>
                    <dd>
                      {(["page", "widget"] as const)
                        .filter((channel) => channels[channel].enabled)
                        .map((channel) => (channel === "page" ? "Page publique" : "Widget"))
                        .join(", ") || "— Aucun —"}
                    </dd>
                    <dt>Sources</dt>
                    <dd>
                      {[
                        sources.connaissances ? "Connaissances" : "",
                        sources.phototheque ? "Photothèque" : "",
                        sources.lien ? "Liens" : "",
                      ]
                        .filter((value) => value !== "")
                        .join(", ") || "Aucune"}
                    </dd>
                    <dt>Quotas</dt>
                    <dd>{quotasSummary}</dd>
                    <dt>Expiration</dt>
                    <dd>{expiresAt === "" ? "Sans expiration" : expiresAt}</dd>
                  </dl>
                </section>
              ) : null}
            </div>

            <div className="chatbot-wizard-footer">
              <div>
                {step > 0 ? (
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={pending}
                    onClick={() => goToStep(step - 1)}
                  >
                    Retour
                  </button>
                ) : (
                  <button type="button" className="btn ghost small" onClick={onClose}>
                    Annuler
                  </button>
                )}
              </div>
              <div className="tools">
                <span className="hint chatbot-step-counter">
                  Étape {step + 1} / {EDIT_STEPS.length}
                </span>
                {step < EDIT_STEPS.length - 1 ? (
                  <button type="button" className="btn small" disabled={pending} onClick={goNext}>
                    Suivant
                  </button>
                ) : (
                  <button type="submit" className="btn small" disabled={pending}>
                    {pending ? "Enregistrement…" : "Enregistrer"}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
