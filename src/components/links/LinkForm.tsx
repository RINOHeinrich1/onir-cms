"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import {
  CHAT_LINK_TYPES,
  type ChatLinkSources,
  type ChatLinkSurface,
  type ChatLinkType,
  DEFAULT_LINK_SOURCES,
} from "@/domain/entities/chat";
import { AiAssignmentField, type LinkAiValue } from "./AiAssignmentField";
import { ChatbotBehaviorFields } from "./ChatbotBehaviorFields";
import { ChatbotFichePicker } from "./ChatbotFichePicker";
import {
  type ChatbotConfigDraft,
  chatbotConfigPayload,
  defaultChatbotConfigDraft,
  guidedPromptFromDraft,
} from "./chatbot-config-draft";
import { type ChannelDrafts, channelApiPayload, LinkChannelsFields } from "./LinkChannelsFields";
import { LinkDataBindingsField } from "./LinkDataBindingsField";
import { EMPTY_LINK_QUOTA_DRAFT, type LinkQuotaDraft, LinkQuotaFields } from "./LinkQuotaFields";
import { SourcesField } from "./SourcesField";
import type {
  AiProviderOption,
  ConfidentialiteOption,
  CreatedLink,
  ProspectOption,
  VisualTemplateOption,
} from "./types";
import { UserStateField } from "./UserStateField";
import {
  parseVisualTemplateSelection,
  widgetDisplayForSelection,
} from "./visual-template-selection";

type LinkFormProps = {
  prospects: ProspectOption[];
  confidentialites: ConfidentialiteOption[];
  visualTemplates: VisualTemplateOption[];
  aiProviders: AiProviderOption[];
  canAssignAi: boolean;
  onCreated: (created: CreatedLink) => void;
  onCancel: () => void;
};

const STEPS = [
  { title: "Contexte & comportement", short: "Contexte" },
  { title: "Fiches de collecte", short: "Fiches" },
  { title: "Diffusion", short: "Diffusion" },
  { title: "Récapitulatif & création", short: "Récapitulatif" },
] as const;

/** Création d'un chatbot en 4 étapes dans la même modale. */
export function LinkForm({
  prospects,
  confidentialites,
  visualTemplates,
  aiProviders,
  canAssignAi,
  onCreated,
  onCancel,
}: LinkFormProps) {
  const [step, setStep] = useState(0);
  const [maxVisited, setMaxVisited] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [config, setConfig] = useState<ChatbotConfigDraft>(defaultChatbotConfigDraft);
  const [type, setType] = useState<ChatLinkType>("specifique");
  const [channels, setChannels] = useState<ChannelDrafts>({
    page: {
      enabled: true,
      identificationMode: "contact",
      confidentialiteId: confidentialites[0]?.id ?? "",
      visualTemplate: "",
      params: {},
      widgetPosition: "bottom-right",
    },
    widget: {
      enabled: false,
      identificationMode: "anonymous",
      confidentialiteId: "",
      visualTemplate: "",
      params: {},
      widgetPosition: "bottom-right",
    },
  });
  const [activeChannel, setActiveChannel] = useState<ChatLinkSurface>("page");
  const [prospectId, setProspectId] = useState("");
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sources, setSources] = useState<ChatLinkSources>({ ...DEFAULT_LINK_SOURCES });
  const [userStateEnabled, setUserStateEnabled] = useState(false);
  const [quota, setQuota] = useState<LinkQuotaDraft>(EMPTY_LINK_QUOTA_DRAFT);
  const [dataBindings, setDataBindings] = useState<Record<string, string>>({});
  const [ai, setAi] = useState<LinkAiValue>({ aiProviderId: null, aiModel: null });
  const activeTemplate = parseVisualTemplateSelection(channels[activeChannel].visualTemplate);
  const widgetDisplay = widgetDisplayForSelection(visualTemplates, channels.widget.visualTemplate);
  const selectedProspect = useMemo(
    () => prospects.find((prospect) => prospect.id === prospectId) ?? null,
    [prospects, prospectId],
  );
  const enabledChannels = (["page", "widget"] as const).filter(
    (channel) => channels[channel].enabled,
  );
  const guidedPrompt = guidedPromptFromDraft(config);

  const validateStep = (index: number): string | null => {
    if (index === 0) {
      if (type === "specifique" && prospectId === "") {
        return "Choisissez le prospect rattaché au chatbot.";
      }
      if (config.behaviorMode === "expert" && config.systemPrompt.trim() === "") {
        return "Le prompt système est obligatoire en mode expert.";
      }
      return null;
    }
    if (index === 1) {
      if (config.fiches.length === 0) {
        return "Sélectionnez au moins une fiche de collecte.";
      }
      return null;
    }
    if (index === 2) {
      if (!channels.page.enabled && !channels.widget.enabled) {
        return "Activez au moins un canal de diffusion.";
      }
      if (channels.widget.enabled && widgetDisplay === null) {
        return "Choisissez un template visuel compatible avec le widget.";
      }
      return null;
    }
    return null;
  };

  const firstInvalidStep = (): { index: number; message: string } | null => {
    for (let index = 0; index < STEPS.length; index += 1) {
      const message = validateStep(index);
      if (message !== null) return { index, message };
    }
    return null;
  };

  const goToStep = (index: number): void => {
    setStep(index);
    setMaxVisited((current) => Math.max(current, index));
    setStepError(null);
  };

  const goNext = (): void => {
    const message = validateStep(step);
    if (message !== null) {
      setStepError(message);
      return;
    }
    if (step < STEPS.length - 1) goToStep(step + 1);
  };

  const goBack = (): void => {
    if (step === 0) return;
    setStepError(null);
    setStep(step - 1);
  };

  const createChatbot = async (): Promise<void> => {
    const invalid = firstInvalidStep();
    if (invalid !== null) {
      setStep(invalid.index);
      setMaxVisited((current) => Math.max(current, invalid.index));
      setStepError(invalid.message);
      return;
    }
    setError(null);
    setStepError(null);
    setPending(true);
    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: chatbotConfigPayload(config),
          type,
          ...(type === "specifique" ? { prospectId } : {}),
          ...(label.trim() === "" ? {} : { label: label.trim() }),
          ...(expiresAt === "" ? {} : { expiresAt }),
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
          dataBindings,
        }),
      });
      const json = (await response.json()) as CreatedLink & { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Création impossible");
        return;
      }
      toast.success("Chatbot créé.");
      onCreated(json);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    // La création est déclenchée uniquement par le bouton final : un clic sur
    // « Suivant » ne doit jamais pouvoir soumettre le formulaire pendant la
    // transition d'étape.
    event.preventDefault();
  };

  const changeType = (next: ChatLinkType): void => {
    setType(next);
    setChannels((current) => ({
      ...current,
      page: {
        ...current.page,
        identificationMode: next === "specifique" ? "contact" : current.page.identificationMode,
      },
      widget: {
        ...current.widget,
        identificationMode: next === "standard" ? "anonymous" : current.widget.identificationMode,
      },
    }));
  };

  const quotasSummary =
    quota.maxFiches === "" && quota.maxTokens === ""
      ? "Illimité"
      : [
          quota.maxFiches === "" ? "Fiches illimitées" : `${quota.maxFiches} fiche(s)`,
          quota.maxTokens === "" ? "Tokens illimités" : `${quota.maxTokens} token(s)`,
        ].join(" · ");

  return (
    <form className="chatbot-wizard" onSubmit={onSubmit} noValidate>
      <nav className="chatbot-wizard-stepper" aria-label="Étapes de création">
        {STEPS.map((entry, index) => {
          const current = index === step;
          const done = index < step;
          return (
            <button
              key={entry.title}
              type="button"
              className={`chatbot-step${current ? " active" : ""}${done ? " done" : ""}`}
              aria-current={current ? "step" : undefined}
              disabled={pending || index > maxVisited}
              onClick={() => goToStep(index)}
            >
              <span className="chatbot-step-number">{index + 1}</span>
              <span className="chatbot-step-label">
                <span className="chatbot-step-title">{entry.title}</span>
                <span className="chatbot-step-short">{entry.short}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="chatbot-wizard-body">
        {stepError !== null ? <p className="alert error">{stepError}</p> : null}
        {error !== null ? <p className="alert error">{error}</p> : null}

        {step === 0 ? (
          <section className="chatbot-step-panel" aria-label={STEPS[0].title}>
            <div className="chatbot-step-head">
              <h4>Contexte & comportement</h4>
              <p className="hint">
                Identifiez le chatbot puis choisissez la façon de définir son comportement.
              </p>
            </div>
            <div className="chatbot-step-grid">
              <label className="field">
                Libellé du chatbot (optionnel)
                <input
                  type="text"
                  placeholder="Ex. Salon IT, Stand, Campagne"
                  maxLength={120}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </label>
              <label className="field">
                Type de chatbot
                <select
                  value={type}
                  onChange={(event) => changeType(event.target.value as ChatLinkType)}
                >
                  {CHAT_LINK_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value === "specifique" ? "Spécifique à un prospect" : "Standard"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {type === "specifique" ? (
              <label className="field">
                Prospect rattaché *
                <select value={prospectId} onChange={(event) => setProspectId(event.target.value)}>
                  <option value="">— Choisir —</option>
                  {prospects.map((prospect) => (
                    <option key={prospect.id} value={prospect.id}>
                      {prospect.nom} {prospect.prenom} ({prospect.email})
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Identification : prospect lié au lien. Aucun formulaire de contact.
                </span>
              </label>
            ) : null}
            <ChatbotBehaviorFields value={config} onChange={setConfig} />
          </section>
        ) : null}

        {step === 1 ? (
          <section className="chatbot-step-panel" aria-label={STEPS[1].title}>
            <div className="chatbot-step-head">
              <h4>Fiches de collecte</h4>
              <p className="hint">
                Choisissez les fiches que ce chatbot pourra remplir (au moins une).
              </p>
            </div>
            <ChatbotFichePicker
              value={config.fiches}
              onChange={(fiches) => setConfig((current) => ({ ...current, fiches }))}
            />
          </section>
        ) : null}

        {step === 2 ? (
          <section className="chatbot-step-panel" aria-label={STEPS[2].title}>
            <div className="chatbot-step-head">
              <h4>Diffusion</h4>
              <p className="hint">
                Activez les canaux, puis ajustez les sources et les limites. Les options avancées
                restent repliées.
              </p>
            </div>
            <LinkChannelsFields
              value={channels}
              onChange={setChannels}
              active={activeChannel}
              onActiveChange={(channel) => {
                setActiveChannel(channel);
                setDataBindings({});
              }}
              type={type}
              visualTemplates={visualTemplates}
              confidentialites={confidentialites}
            />
            <SourcesField value={sources} onChange={setSources} />
            <LinkQuotaFields value={quota} onChange={setQuota} />
            <label className="field">
              Expiration (optionnel)
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <span className="hint">
                Vide = sans expiration. Le lien reste valide jusqu&apos;à la fin du jour choisi.
              </span>
            </label>
            <details className="chatbot-advanced">
              <summary>Options avancées</summary>
              <div className="chatbot-advanced-body">
                <UserStateField value={userStateEnabled} onChange={setUserStateEnabled} />
                <LinkDataBindingsField
                  templateId={activeTemplate.id}
                  templateVersion={activeTemplate.version}
                  value={dataBindings}
                  onChange={setDataBindings}
                />
                <AiAssignmentField
                  providers={aiProviders}
                  value={ai}
                  onChange={setAi}
                  canAssign={canAssignAi}
                />
              </div>
            </details>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="chatbot-step-panel" aria-label={STEPS[3].title}>
            <div className="chatbot-step-head">
              <h4>Récapitulatif</h4>
              <p className="hint">Vérifiez la configuration avant de créer le chatbot.</p>
            </div>
            <dl className="kv chatbot-summary">
              <dt>Type</dt>
              <dd>{type === "specifique" ? "Spécifique à un prospect" : "Standard"}</dd>
              <dt>Prospect</dt>
              <dd>
                {type === "specifique"
                  ? selectedProspect === null
                    ? "— Non sélectionné —"
                    : `${selectedProspect.nom} ${selectedProspect.prenom} (${selectedProspect.email})`
                  : "Aucun"}
              </dd>
              <dt>Comportement</dt>
              <dd>
                {config.behaviorMode === "guided"
                  ? "Guidé (prompt généré)"
                  : "Expert (prompt libre)"}
              </dd>
              <dt>Fiches</dt>
              <dd>
                {config.fiches.length === 0
                  ? "— Aucune —"
                  : config.fiches.map((fiche) => fiche.label || fiche.key).join(", ")}
              </dd>
              <dt>Canaux</dt>
              <dd>
                {enabledChannels.length === 0
                  ? "— Aucun —"
                  : enabledChannels
                      .map((channel) => (channel === "page" ? "Page publique" : "Widget"))
                      .join(", ")}
              </dd>
              <dt>Quotas</dt>
              <dd>{quotasSummary}</dd>
              <dt>Expiration</dt>
              <dd>{expiresAt === "" ? "Sans expiration" : expiresAt}</dd>
            </dl>
            <ul className="chatbot-checklist">
              <li className={type === "specifique" && prospectId === "" ? "warn" : "ok"}>
                {type === "specifique" ? "Prospect rattaché" : "Type standard sans prospect"}
              </li>
              <li className={config.fiches.length > 0 ? "ok" : "warn"}>
                Au moins une fiche de collecte
              </li>
              <li className={enabledChannels.length > 0 ? "ok" : "warn"}>
                Au moins un canal de diffusion
              </li>
              <li className={channels.widget.enabled && widgetDisplay === null ? "warn" : "ok"}>
                Template widget compatible
              </li>
              <li
                className={
                  config.behaviorMode === "expert" && config.systemPrompt.trim() === ""
                    ? "warn"
                    : "ok"
                }
              >
                {config.behaviorMode === "expert"
                  ? "Prompt expert renseigné"
                  : "Prompt guidé généré"}
              </li>
            </ul>
            {config.behaviorMode === "guided" ? (
              <details className="prompt-preview-block">
                <summary>Voir le prompt généré</summary>
                <pre className="prompt-preview">{guidedPrompt === "" ? "—" : guidedPrompt}</pre>
              </details>
            ) : null}
          </section>
        ) : null}
      </div>

      <div className="chatbot-wizard-footer">
        <div>
          {step > 0 ? (
            <button type="button" className="btn ghost small" disabled={pending} onClick={goBack}>
              Retour
            </button>
          ) : (
            <button type="button" className="btn ghost small" disabled={pending} onClick={onCancel}>
              Annuler
            </button>
          )}
        </div>
        <div className="tools">
          <span className="hint chatbot-step-counter">
            Étape {step + 1} / {STEPS.length}
          </span>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn small" disabled={pending} onClick={goNext}>
              Suivant
            </button>
          ) : (
            <button
              type="button"
              className="btn small"
              disabled={pending}
              onClick={() => void createChatbot()}
            >
              {pending ? "Création…" : "Créer le chatbot"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
