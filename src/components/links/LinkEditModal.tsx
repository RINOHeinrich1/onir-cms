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
  isPublicChatLink,
} from "@/domain/entities/chat";
import type { LinkAiValue } from "./AiAssignmentField";
import { AiUsageOverridesField } from "./AiUsageOverridesField";
import { ChatbotBehaviorFields } from "./ChatbotBehaviorFields";
import { ChatbotDataStep } from "./ChatbotDataStep";
import { ChatbotFallbackFields } from "./ChatbotFallbackFields";
import { ChatbotFichePicker } from "./ChatbotFichePicker";
import { ChatbotMissionField } from "./ChatbotMissionField";
import { ChatbotSearchToolFields } from "./ChatbotSearchToolFields";
import { ChatbotSourceLabelsFields } from "./ChatbotSourceLabelsFields";
import {
  type ChatbotConfigDraft,
  chatbotConfigPayload,
  draftFromConfig,
  searchToolDraftViolations,
} from "./chatbot-config-draft";
import {
  type ChatbotDataDraft,
  chatbotDataDraftCount,
  EMPTY_CHATBOT_DATA_DRAFT,
  submitChatbotDataDraft,
} from "./chatbot-data-draft";
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
  { title: "Cadrage", short: "Cadrage" },
  { title: "Alimentation", short: "Alimentation" },
  { title: "Publication", short: "Publication" },
  { title: "IA & secours", short: "IA & secours" },
  { title: "Validation", short: "Validation" },
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
  const [dataDraft, setDataDraft] = useState<ChatbotDataDraft>(EMPTY_CHATBOT_DATA_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  useToastOnMessage(stepError);
  const activeTemplate = parseVisualTemplateSelection(channels[activeChannel].visualTemplate);
  const widgetDisplay = widgetDisplayForSelection(visualTemplates, channels.widget.visualTemplate);
  const publicLink = isPublicChatLink(channels);
  const dialogRef = useRef<HTMLDivElement>(null);

  const uploadDraftPhoto = async (input: {
    fichier: File;
    libelle: string;
    description: string;
  }): Promise<{ mediaId: string }> => {
    const form = new FormData();
    form.set("libelle", input.libelle);
    form.set("description", input.description);
    form.set("actif", "false");
    form.set("fichier", input.fichier);
    const response = await fetch("/api/medias/photo", { method: "POST", body: form });
    const json = (await response.json().catch(() => null)) as {
      media?: { id?: unknown };
      error?: string;
    } | null;
    if (!response.ok) {
      throw new Error(json?.error ?? "Import de la photo impossible.");
    }
    const mediaId = json?.media?.id;
    if (typeof mediaId !== "string" || mediaId === "") {
      throw new Error("Réponse d'import invalide.");
    }
    return { mediaId };
  };

  const removeDraftPhoto = (photo: { mediaId?: string }): void => {
    if (photo.mediaId === undefined) return;
    void fetch(`/api/medias/${photo.mediaId}`, { method: "DELETE" })
      .then((response) => {
        if (!response.ok) toast.warning("La photo temporaire n'a pas pu être supprimée.");
      })
      .catch(() => toast.warning("La photo temporaire n'a pas pu être supprimée."));
  };

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
    if (index === 1 && config !== null) {
      if (config.mission !== "collect") {
        const violations = searchToolDraftViolations(config.searchTool, publicLink);
        if (violations.length > 0) return violations.join(" · ");
        const hasSource =
          config.searchTool.enabled || sources.connaissances || sources.phototheque || sources.lien;
        if (!hasSource) return "Activez au moins une source d’information pour cette mission.";
      }
      if (config.mission !== "inform" && config.fiches.length === 0) {
        return "Sélectionnez au moins une fiche de collecte pour cette mission.";
      }
    }
    if (index === 3 && config !== null) {
      if (
        config.fallback.enabled &&
        config.fallback.questions.length === 0 &&
        !config.fallback.showCollectionForm
      ) {
        return "Ajoutez au moins une question de secours ou autorisez la fiche de collecte.";
      }
    }
    if (index === 2) {
      if (!channels.page.enabled && !channels.widget.enabled) {
        return "Activez au moins un canal de publication.";
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

  const save = async (force = false): Promise<void> => {
    setError(null);
    if (!force && step < EDIT_STEPS.length - 1) {
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
          ...(config === null
            ? {}
            : { config: chatbotConfigPayload(config, { publicLink, sources }) }),
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
        toast.warning("Chatbot mis à jour, mais les modèles IA n'ont pas pu être enregistrés.");
      }
      if (config?.mission !== "collect" && chatbotDataDraftCount(dataDraft) > 0) {
        try {
          const result = await submitChatbotDataDraft(dataDraft, link.id);
          if (result.created > 0) {
            toast.success(`${result.created} donnée(s) rattachée(s) au chatbot.`);
          }
          if (result.failures.length > 0) {
            toast.warning(`Certaines données n'ont pas pu être ajoutées : ${result.failures[0]}`);
          } else {
            setDataDraft(EMPTY_CHATBOT_DATA_DRAFT);
          }
        } catch {
          toast.warning("Chatbot mis à jour, mais les données n'ont pas pu être ajoutées.");
        }
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

  const onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void save(false);
  };

  const canFinish = EDIT_STEPS.map((_, index) => index).every(
    (index) => validateStep(index) === null,
  );

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
                    <h4>Cadrage</h4>
                    <p className="hint">
                      Identité du chatbot, mission, comportement, expiration et catégorie.
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
                    <>
                      <ChatbotMissionField
                        value={config.mission}
                        onChange={(mission) =>
                          setConfig((current) =>
                            current === null ? current : { ...current, mission },
                          )
                        }
                      />
                      <ChatbotBehaviorFields value={config} onChange={setConfig} />
                    </>
                  ) : null}
                  <CategoryPicker contentType="link" contentId={link.id} />
                </section>
              ) : null}

              {step === 1 ? (
                <section className="chatbot-step-panel" aria-label={EDIT_STEPS[1].title}>
                  <div className="chatbot-step-head">
                    <h4>Alimentation</h4>
                    <p className="hint">
                      Ce que le chatbot collecte et les sources qu’il consulte pour répondre.
                    </p>
                  </div>
                  {config === null ? (
                    <p className="hint">Chargement de la configuration…</p>
                  ) : (
                    <>
                      {config.mission !== "inform" ? (
                        <div className="chatbot-subsection">
                          <h5>Fiches à collecter</h5>
                          <ChatbotFichePicker
                            value={config.fiches}
                            onChange={(fiches) =>
                              setConfig((current) =>
                                current === null ? current : { ...current, fiches },
                              )
                            }
                          />
                        </div>
                      ) : null}
                      {config.mission !== "collect" ? (
                        <div className="chatbot-subsection">
                          <h5>Sources à consulter</h5>
                          <SourcesField value={sources} onChange={setSources} />
                          <ChatbotSearchToolFields
                            value={config.searchTool}
                            onChange={(searchTool) =>
                              setConfig((current) =>
                                current === null ? current : { ...current, searchTool },
                              )
                            }
                            fiches={config.fiches}
                            publicLink={publicLink}
                          />
                          <ChatbotSourceLabelsFields
                            value={config.sourceMeta}
                            onChange={(sourceMeta) =>
                              setConfig((current) =>
                                current === null ? current : { ...current, sourceMeta },
                              )
                            }
                          />
                          <ChatbotDataStep
                            value={dataDraft}
                            onChange={setDataDraft}
                            selection={config.dataSelection}
                            onSelectionChange={(dataSelection) =>
                              setConfig((current) =>
                                current === null ? current : { ...current, dataSelection },
                              )
                            }
                            chatLinkId={link.id}
                            onUploadPhoto={uploadDraftPhoto}
                            onRemovePhoto={removeDraftPhoto}
                          />
                        </div>
                      ) : (
                        <p className="alert info">
                          Mission « Collecter des fiches » : les sources d’information sont
                          désactivées.
                        </p>
                      )}
                    </>
                  )}
                </section>
              ) : null}

              {step === 2 ? (
                <section className="chatbot-step-panel" aria-label={EDIT_STEPS[2].title}>
                  <div className="chatbot-step-head">
                    <h4>Publication</h4>
                    <p className="hint">
                      Canaux, template visuel, état visiteur et bindings de données.
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
                    <h4>IA & secours</h4>
                    <p className="hint">
                      Choisissez les modèles IA et le comportement de secours si l’IA ne répond pas.
                    </p>
                  </div>
                  <div className="chatbot-subsection">
                    <h5>Modèles IA</h5>
                    <AiUsageOverridesField
                      chatLinkId={link.id}
                      providers={aiProviders}
                      value={aiUsage}
                      onChange={setAiUsage}
                      canAssign={canAssignAi}
                    />
                  </div>
                  {config !== null ? (
                    <div className="chatbot-subsection">
                      <h5>Si l’IA ne répond pas</h5>
                      <ChatbotFallbackFields
                        value={config.fallback}
                        onChange={(fallback) =>
                          setConfig((current) =>
                            current === null ? current : { ...current, fallback },
                          )
                        }
                      />
                    </div>
                  ) : null}
                </section>
              ) : null}

              {step === 4 ? (
                <section className="chatbot-step-panel" aria-label={EDIT_STEPS[4].title}>
                  <div className="chatbot-step-head">
                    <h4>Validation</h4>
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
                    <dt>Sources</dt>
                    <dd>
                      {config?.mission === "collect"
                        ? "Désactivées par la mission"
                        : [
                            config?.searchTool.enabled ? "Fiches existantes" : "",
                            sources.connaissances ? "Connaissances" : "",
                            sources.phototheque ? "Photothèque" : "",
                            sources.lien ? "Liens" : "",
                          ]
                            .filter((value) => value !== "")
                            .join(", ") || "Aucune source active"}
                    </dd>
                    <dt>Canaux</dt>
                    <dd>
                      {(["page", "widget"] as const)
                        .filter((channel) => channels[channel].enabled)
                        .map((channel) => (channel === "page" ? "Page publique" : "Widget"))
                        .join(", ") || "— Aucun —"}
                    </dd>
                    <dt>Données ajoutées</dt>
                    <dd>
                      {chatbotDataDraftCount(dataDraft) === 0
                        ? "Aucune"
                        : `${chatbotDataDraftCount(dataDraft)} ajout(s) à rattacher`}
                    </dd>
                    <dt>Configuration IA</dt>
                    <dd>
                      {Object.keys(aiUsage).length === 0
                        ? "Réglages par défaut de l’organisation"
                        : `${Object.keys(aiUsage).length} usage(s) personnalisé(s)`}
                    </dd>
                    <dt>Secours</dt>
                    <dd>
                      {config === null || !config.fallback.enabled
                        ? "Désactivé"
                        : `${config.fallback.questions.length} question(s)${config.fallback.showCollectionForm ? " · fiche de collecte" : ""}`}
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
                ) : null}
                {canFinish ? (
                  <button
                    type="button"
                    className="btn small"
                    disabled={pending}
                    onClick={() => void save(true)}
                  >
                    {pending ? "Enregistrement…" : "Terminer"}
                  </button>
                ) : null}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
