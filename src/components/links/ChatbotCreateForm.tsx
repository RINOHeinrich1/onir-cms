"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnaissanceConflict } from "@/application/use-cases/connaissances/resolve-connaissance-conflicts";
import { HelpHint } from "@/components/ui/HelpHint";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import type { AiLinkTarget, AiLinkUsage } from "@/domain/entities/ai-usage";
import {
  type ChatLinkSources,
  type ChatLinkSurface,
  type ChatLinkType,
  isPublicChatLink,
} from "@/domain/entities/chat";
import type { LinkAiValue } from "./AiAssignmentField";
import { AiUsageOverridesField } from "./AiUsageOverridesField";
import { ChatbotBehaviorFields } from "./ChatbotBehaviorFields";
import { ChatbotDataStep } from "./ChatbotDataStep";
import { ChatbotFallbackFields } from "./ChatbotFallbackFields";
import { ChatbotFichePicker } from "./ChatbotFichePicker";
import { ChatbotMissionField } from "./ChatbotMissionField";
import {
  type ConnaissanceConflictAction,
  ConnaissanceConflictModal,
} from "./ConnaissanceConflictModal";
import {
  type ChatbotConfigDraft,
  chatbotConfigPayload,
  guidedPromptFromDraft,
  searchToolDraftViolations,
} from "./chatbot-config-draft";
import {
  type ChatbotDataDraft,
  type ConnaissanceConflictResolution,
  chatbotDataDraftCount,
  checkConnaissanceConflicts,
  submitChatbotDataDraft,
} from "./chatbot-data-draft";
import {
  type ChatbotDraftState,
  chatbotDraftSaveAction,
  chatbotDraftStateSignature,
  defaultChatbotDraftState,
  hydrateChatbotDraftState,
  isChatbotDraftStateMeaningful,
  serializeChatbotDraftState,
} from "./chatbot-draft-state";
import {
  CHATBOT_STEPS,
  chatbotStepPosition,
  isChatbotStepVisible,
  nextChatbotStep,
  previousChatbotStep,
  visibleChatbotStepIndices,
} from "./chatbot-steps";
import { type ChannelDrafts, channelApiPayload, LinkChannelsFields } from "./LinkChannelsFields";
import { LinkDataBindingsField } from "./LinkDataBindingsField";
import { type LinkQuotaDraft, LinkQuotaFields } from "./LinkQuotaFields";
import type {
  AiProviderOption,
  ConfidentialiteOption,
  CreatedLink,
  ProspectOption,
  VisualTemplateOption,
} from "./types";
import { UserStateField } from "./UserStateField";
import {
  defaultStarterSelection,
  parseVisualTemplateSelection,
  widgetDisplayForSelection,
} from "./visual-template-selection";

type ChatbotCreateFormProps = {
  prospects: ProspectOption[];
  confidentialites: ConfidentialiteOption[];
  visualTemplates: VisualTemplateOption[];
  aiProviders: AiProviderOption[];
  canAssignAi: boolean;
  /** État sérialisé d'un brouillon existant à reprendre (null = création). */
  initialDraft?: Record<string, unknown> | null;
  /** Identifiant du brouillon repris (null pour une création). */
  draftId?: string | null;
  onCreated: (created: CreatedLink) => void;
  onCancel: () => void;
};

/** Création d'un chatbot en 7 étapes, dont deux conditionnées par l'opération. */
export function ChatbotCreateForm({
  prospects,
  confidentialites,
  visualTemplates,
  aiProviders,
  canAssignAi,
  initialDraft = null,
  draftId = null,
  onCreated,
  onCancel,
}: ChatbotCreateFormProps) {
  const fallbackState = useMemo(() => {
    const state = defaultChatbotDraftState(confidentialites[0]?.id ?? "");
    const starter = defaultStarterSelection(visualTemplates);
    if (starter !== null) {
      state.channels.page = {
        ...state.channels.page,
        visualTemplate: starter.visualTemplate,
        params: starter.params,
      };
    }
    return state;
  }, [confidentialites, visualTemplates]);
  const initial = useMemo(
    () =>
      initialDraft === null ? fallbackState : hydrateChatbotDraftState(initialDraft, fallbackState),
    [initialDraft, fallbackState],
  );
  const resumed = initialDraft !== null;
  const [step, setStep] = useState(() => {
    if (isChatbotStepVisible(initial.step, initial.config.mission)) return initial.step;
    return visibleChatbotStepIndices(initial.config.mission)[0] ?? 0;
  });
  const [maxVisited, setMaxVisited] = useState(
    initialDraft === null ? initial.step : CHATBOT_STEPS.length - 1,
  );
  const [stepError, setStepError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [connaissanceConflicts, setConnaissanceConflicts] = useState<ConnaissanceConflict[] | null>(
    null,
  );
  const [config, setConfig] = useState<ChatbotConfigDraft>(initial.config);
  const [type, setType] = useState<ChatLinkType>(initial.type);
  const [channels, setChannels] = useState<ChannelDrafts>(initial.channels);
  const [activeChannel, setActiveChannel] = useState<ChatLinkSurface>(initial.activeChannel);
  const [prospectId, setProspectId] = useState(initial.prospectId);
  const [label, setLabel] = useState(initial.label);
  const [expiresAt, setExpiresAt] = useState(initial.expiresAt);
  const [sources, setSources] = useState<ChatLinkSources>(initial.sources);
  const [userStateEnabled, setUserStateEnabled] = useState(initial.userStateEnabled);
  const [quota, setQuota] = useState<LinkQuotaDraft>(initial.quota);
  const [dataBindings, setDataBindings] = useState<Record<string, string>>(initial.dataBindings);
  const [dataDraft, setDataDraft] = useState<ChatbotDataDraft>(initial.dataDraft);
  const [globalDataCounts, setGlobalDataCounts] = useState({
    connaissances: 0,
    photos: 0,
    liens: 0,
  });
  const [ai] = useState<LinkAiValue>(initial.ai);
  const [aiUsage, setAiUsage] = useState<Partial<Record<AiLinkUsage, AiLinkTarget>>>(
    initial.aiUsage,
  );
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useToastOnMessage(stepError);
  useToastOnMessage(saveError);
  const activeTemplate = parseVisualTemplateSelection(channels[activeChannel].visualTemplate);
  const widgetDisplay = widgetDisplayForSelection(visualTemplates, channels.widget.visualTemplate);
  const selectedProspect = useMemo(
    () => prospects.find((prospect) => prospect.id === prospectId) ?? null,
    [prospects, prospectId],
  );
  const enabledChannels = (["page", "widget"] as const).filter(
    (channel) => channels[channel].enabled,
  );
  const publicLink = isPublicChatLink(channels);
  const guidedPrompt = guidedPromptFromDraft(config);
  const pendingDataCount = chatbotDataDraftCount(dataDraft);

  const draftState = useMemo<ChatbotDraftState>(
    () => ({
      step,
      type,
      prospectId,
      label,
      expiresAt,
      config,
      channels,
      activeChannel,
      sources,
      userStateEnabled,
      quota,
      dataBindings,
      ai,
      aiUsage,
      dataDraft,
    }),
    [
      step,
      type,
      prospectId,
      label,
      expiresAt,
      config,
      channels,
      activeChannel,
      sources,
      userStateEnabled,
      quota,
      dataBindings,
      ai,
      aiUsage,
      dataDraft,
    ],
  );
  const draftSignature = useMemo(() => chatbotDraftStateSignature(draftState), [draftState]);
  const draftMeaningful = useMemo(() => isChatbotDraftStateMeaningful(draftState), [draftState]);

  const draftIdRef = useRef<string | null>(draftId);
  const savedSignatureRef = useRef<string | null>(null);
  const latestDraftRef = useRef({
    state: draftState,
    signature: draftSignature,
    meaningful: draftMeaningful,
  });
  latestDraftRef.current = {
    state: draftState,
    signature: draftSignature,
    meaningful: draftMeaningful,
  };
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const finalizedRef = useRef(false);
  const mountedRef = useRef(false);
  const initializedRef = useRef(false);
  const saveNowRef = useRef<() => Promise<void>>(async () => undefined);

  const saveDraftNow = useCallback(async (): Promise<void> => {
    if (finalizedRef.current) return;
    const latest = latestDraftRef.current;
    const action = chatbotDraftSaveAction({
      draftId: draftIdRef.current,
      savedSignature: savedSignatureRef.current,
      currentSignature: latest.signature,
      meaningful: latest.meaningful,
    });
    if (action === "none") return;
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    savingRef.current = true;
    if (mountedRef.current) setSavingDraft(true);
    try {
      const body = JSON.stringify({
        label: latest.state.label,
        state: serializeChatbotDraftState(latest.state),
      });
      // `keepalive` permet à la sauvegarde de survivre à un rechargement de
      // page, dans la limite du quota navigateur (~64 Kio).
      const keepalive = body.length < 60_000;
      const response =
        action === "create"
          ? await fetch("/api/chatbot-drafts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
              keepalive,
            })
          : await fetch(`/api/chatbot-drafts/${draftIdRef.current}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body,
              keepalive,
            });
      const json = (await response.json().catch(() => null)) as {
        draft?: { id?: unknown };
        error?: string;
      } | null;
      if (!response.ok) {
        if (mountedRef.current) {
          setSaveError(json?.error ?? "Sauvegarde du brouillon impossible.");
        }
        return;
      }
      if (action === "create") {
        const createdId = json?.draft?.id;
        if (typeof createdId !== "string" || createdId === "") {
          if (mountedRef.current) setSaveError("Réponse de sauvegarde invalide.");
          return;
        }
        draftIdRef.current = createdId;
      }
      savedSignatureRef.current = latest.signature;
      if (mountedRef.current) setSaveError(null);
    } catch {
      if (mountedRef.current) {
        setSaveError("Erreur réseau : le brouillon n'a pas pu être sauvegardé.");
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSavingDraft(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        window.setTimeout(() => void saveNowRef.current(), 0);
      }
    }
  }, []);
  saveNowRef.current = saveDraftNow;

  useEffect(() => {
    mountedRef.current = true;
    if (!initializedRef.current) {
      initializedRef.current = true;
      savedSignatureRef.current = draftSignature;
      return;
    }
    const action = chatbotDraftSaveAction({
      draftId: draftIdRef.current,
      savedSignature: savedSignatureRef.current,
      currentSignature: draftSignature,
      meaningful: draftMeaningful,
    });
    if (action === "none") return;
    const timer = window.setTimeout(() => void saveNowRef.current(), 700);
    return () => window.clearTimeout(timer);
  }, [draftSignature, draftMeaningful]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      void saveNowRef.current();
    };
  }, []);

  useEffect(() => {
    // Dernière chance avant un rechargement/fermeture d'onglet : on tente la
    // sauvegarde et, si elle n'a pas encore abouti, le navigateur avertit.
    const onPageHide = (): void => {
      void saveNowRef.current();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (finalizedRef.current) return;
      if (!latestDraftRef.current.meaningful) return;
      if (latestDraftRef.current.signature === savedSignatureRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const uploadDraftPhoto = useCallback(
    async (input: {
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
    },
    [],
  );

  const removeDraftPhoto = useCallback(
    (photo: { mediaId?: string }): void => {
      if (photo.mediaId === undefined) return;
      void fetch(`/api/medias/${photo.mediaId}`, { method: "DELETE" })
        .then((response) => {
          if (!response.ok) {
            toast.warning("La photo temporaire n'a pas pu être supprimée.");
          }
        })
        .catch(() => toast.warning("La photo temporaire n'a pas pu être supprimée."));
    },
    [toast],
  );

  const validateStep = (index: number): string | null => {
    if (index === 0) {
      if (label.trim() === "") {
        return "Le nom du chatbot est obligatoire.";
      }
      if (type === "specifique" && prospectId === "") {
        return "Choisissez le prospect rattaché au chatbot.";
      }
      if (config.behaviorMode === "expert" && config.systemPrompt.trim() === "") {
        return "Le prompt système est obligatoire en mode expert.";
      }
      return null;
    }
    if (index === 1) {
      if (config.mission !== "inform" && config.fiches.length === 0) {
        return "Sélectionnez au moins une fiche de collecte pour cette opération.";
      }
      return null;
    }
    if (index === 2) {
      const violations = searchToolDraftViolations(config.searchTool, publicLink);
      if (violations.length > 0) return violations.join(" · ");
      const hasSource =
        config.searchTool.enabled || sources.connaissances || sources.phototheque || sources.lien;
      if (!hasSource) return "Activez au moins une source d’information pour cette opération.";
      return null;
    }
    if (index === 3) {
      if (!channels.page.enabled && !channels.widget.enabled) {
        return "Activez au moins un canal de publication.";
      }
      if (channels.widget.enabled && widgetDisplay === null) {
        return "Choisissez un template visuel compatible avec le widget.";
      }
      return null;
    }
    if (index === 4) {
      if (
        config.fallback.enabled &&
        config.fallback.questions.length === 0 &&
        !config.fallback.showCollectionForm
      ) {
        return "Ajoutez au moins une question de secours ou autorisez la fiche de collecte.";
      }
      return null;
    }
    return null;
  };

  const firstInvalidStep = (): { index: number; message: string } | null => {
    for (const index of visibleChatbotStepIndices(config.mission)) {
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
    const next = nextChatbotStep(step, config.mission);
    if (next !== undefined) goToStep(next);
  };

  const goBack = (): void => {
    const previous = previousChatbotStep(step, config.mission);
    if (previous === undefined) return;
    setStepError(null);
    setStep(previous);
  };

  const changeMission = (mission: ChatbotConfigDraft["mission"]): void => {
    setConfig((current) => ({ ...current, mission }));
    if (!isChatbotStepVisible(step, mission)) {
      const next = nextChatbotStep(step, mission) ?? previousChatbotStep(step, mission);
      if (next !== undefined) setStep(next);
    }
  };

  /** Persiste l'état courant avant une action qui démonte le wizard. */
  const flushDraft = async (): Promise<void> => {
    await saveNowRef.current();
    for (let attempt = 0; attempt < 15 && savingRef.current; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await saveNowRef.current();
  };

  const cancelWizard = async (): Promise<void> => {
    await flushDraft();
    onCancel();
  };

  const createChatbot = async (conflictAction?: ConnaissanceConflictAction): Promise<void> => {
    const invalid = firstInvalidStep();
    if (invalid !== null) {
      setStep(invalid.index);
      setMaxVisited((current) => Math.max(current, invalid.index));
      setStepError(invalid.message);
      return;
    }
    if (
      conflictAction === undefined &&
      dataDraft.connaissances.length > 0 &&
      config.mission !== "collect"
    ) {
      try {
        const found = await checkConnaissanceConflicts(dataDraft.connaissances);
        if (found.length > 0) {
          setConnaissanceConflicts(found);
          return;
        }
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Vérification des connaissances impossible",
        );
        return;
      }
    }
    setError(null);
    setStepError(null);
    setPending(true);
    try {
      // Le brouillon doit refléter le dernier état même si la création échoue.
      await flushDraft();
      const conflictIds =
        conflictAction === "update" && connaissanceConflicts !== null
          ? connaissanceConflicts.map((conflict) => conflict.existingId)
          : [];
      const configForCreate =
        conflictIds.length > 0 && config.dataSelection.mode === "selected"
          ? {
              ...config,
              dataSelection: {
                ...config.dataSelection,
                connaissanceIds: [
                  ...new Set([...config.dataSelection.connaissanceIds, ...conflictIds]),
                ],
              },
            }
          : config;
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: chatbotConfigPayload(configForCreate, { publicLink, sources }),
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
      let failures: string[] = [];
      let failedPhotoMediaIds: string[] = [];
      const resolutions: ConnaissanceConflictResolution[] =
        conflictAction === undefined || connaissanceConflicts === null
          ? []
          : connaissanceConflicts.map((conflict) => ({
              titre: conflict.titre,
              existingId: conflict.existingId,
              existingChatLinkIds: conflict.existingChatLinkIds,
              action: conflictAction,
            }));
      if (pendingDataCount > 0 && config.mission !== "collect") {
        try {
          const result = await submitChatbotDataDraft(dataDraft, json.link.id, resolutions);
          failures = result.failures;
          failedPhotoMediaIds = result.failedPhotoMediaIds;
          if (result.created > 0) {
            toast.success(`${result.created} donnée(s) rattachée(s) au chatbot.`);
          }
          if (result.updated > 0) {
            toast.success(`${result.updated} connaissance(s) mise(s) à jour.`);
          }
          if (result.skipped.length > 0) {
            toast.info(
              `${result.skipped.length} connaissance(s) conservée(s) : les doublons n'ont pas été ajoutés.`,
            );
          }
        } catch {
          failures = ["Ajout des données impossible (erreur inattendue)."];
        }
      }
      // Le chatbot existe : le brouillon ne doit plus être proposé (pas de doublon).
      finalizedRef.current = true;
      const finalizedDraftId = draftIdRef.current;
      draftIdRef.current = null;
      if (finalizedDraftId !== null) {
        // Les photos dont la finalisation a échoué ne sont pas nettoyées avec
        // le brouillon : le fichier importé reste récupérable.
        const keepMedia =
          failedPhotoMediaIds.length > 0
            ? `?keepMedia=${encodeURIComponent(failedPhotoMediaIds.join(","))}`
            : "";
        try {
          const deleted = await fetch(`/api/chatbot-drafts/${finalizedDraftId}${keepMedia}`, {
            method: "DELETE",
          });
          if (!deleted.ok) {
            toast.warning(
              "Chatbot créé, mais le brouillon n'a pas pu être supprimé. Supprimez-le depuis la liste.",
            );
          }
        } catch {
          toast.warning(
            "Chatbot créé, mais le brouillon n'a pas pu être supprimé. Supprimez-le depuis la liste.",
          );
        }
      }
      if (json.knowledge !== undefined) {
        if (json.knowledge.created > 0) {
          toast.success(`${json.knowledge.created} connaissance(s) rattachée(s) au chatbot.`);
        }
        if (json.knowledge.skipped.length > 0) {
          toast.warning(
            `Connaissances ignorées (doublons) : ${json.knowledge.skipped.slice(0, 3).join(" · ")}`,
          );
        }
      }
      toast.success("Chatbot créé.");
      setConnaissanceConflicts(null);
      if (Object.keys(aiUsage).length > 0) {
        const aiResponse = await fetch(`/api/links/${json.link.id}/ai-usage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(aiUsage),
        });
        if (!aiResponse.ok) {
          toast.warning("Chatbot créé, mais les moteurs IA n'ont pas pu être enregistrés.");
        }
      }
      onCreated(json);
      if (failures.length > 0) {
        const detail = failures.slice(0, 3).join(" · ");
        const more = failures.length > 3 ? ` (+${failures.length - 3})` : "";
        toast.warning(
          `Chatbot créé, mais ${failures.length} ajout(s) de données ont échoué : ${detail}${more}`,
        );
      }
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

  const canFinish = firstInvalidStep() === null;
  const stepIndices = visibleChatbotStepIndices(config.mission);
  const stepPosition = chatbotStepPosition(step, config.mission);

  const quotasSummary =
    quota.maxFiches === "" && quota.maxTokens === ""
      ? "Illimité"
      : [
          quota.maxFiches === "" ? "Fiches illimitées" : `${quota.maxFiches} fiche(s)`,
          quota.maxTokens === "" ? "Tokens illimités" : `${quota.maxTokens} token(s)`,
        ].join(" · ");

  return (
    <>
      <form className="chatbot-wizard chatbot-wizard-page" onSubmit={onSubmit} noValidate>
        <nav className="chatbot-wizard-stepper" aria-label="Étapes de création">
          {stepIndices.map((index, position) => {
            const entry = CHATBOT_STEPS[index];
            if (entry === undefined) return null;
            const current = index === step;
            const done = position < stepPosition;
            return (
              <button
                key={entry.title}
                type="button"
                className={`chatbot-step${current ? " active" : ""}${done ? " done" : ""}`}
                aria-current={current ? "step" : undefined}
                disabled={pending || index > maxVisited}
                onClick={() => goToStep(index)}
              >
                <span className="chatbot-step-number">{position + 1}</span>
                <span className="chatbot-step-label">
                  <span className="chatbot-step-title">{entry.title}</span>
                  <span className="chatbot-step-short">{entry.sidebar}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="chatbot-wizard-body">
          <header className="chatbot-page-head">
            <div>
              <p className="chatbot-page-eyebrow">
                Étape {stepPosition + 1} sur {stepIndices.length}
              </p>
              <h1>{CHATBOT_STEPS[step]?.title}</h1>
              <p>{CHATBOT_STEPS[step]?.description}</p>
            </div>
            <div className="chatbot-page-progress">
              <span>{Math.round(((stepPosition + 1) / stepIndices.length) * 100)} %</span>
              <div>
                <span
                  style={{
                    width: `${Math.round(((stepPosition + 1) / stepIndices.length) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </header>
          {stepError !== null ? <p className="alert error">{stepError}</p> : null}
          {error !== null ? <p className="alert error">{error}</p> : null}
          {saveError !== null ? (
            <p className="alert error">
              Brouillon non sauvegardé : {saveError} Vos modifications restent dans cette fenêtre ;
              réessayez avant de fermer.
            </p>
          ) : null}
          {resumed ? (
            <p className="alert info">
              Reprise du brouillon : toutes les données enregistrées (configuration, canaux,
              sélection de données, connaissances, liens et photos) ont été restaurées.
            </p>
          ) : null}

          {step === 0 ? (
            <section className="chatbot-step-panel" aria-label={CHATBOT_STEPS[0].title}>
              <div className="chatbot-step-head">
                <h4>Cadrage</h4>
                <p className="hint">
                  Identifiez le chatbot puis choisissez la façon de définir son comportement.
                </p>
              </div>
              <div className="chatbot-card">
                <div className="chatbot-card-head">
                  <div>
                    <h2>Identité</h2>
                    <p className="hint">Les informations visibles par l’utilisateur et l’équipe.</p>
                  </div>
                  <span className="badge info">Obligatoire</span>
                </div>
                <div className="chatbot-step-grid">
                  <label className="field">
                    Nom du chatbot *
                    <input
                      type="text"
                      required
                      placeholder="Ex. Salon IT, Stand, Campagne"
                      maxLength={120}
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Prospect cible
                    <HelpHint label="Aide sur le prospect cible">
                      Aucun prospect : chatbot standard. Un prospect : lien dédié à ce prospect,
                      sans formulaire de contact.
                    </HelpHint>
                    <select
                      value={type === "specifique" ? prospectId : ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "") {
                          changeType("standard");
                          setProspectId("");
                        } else {
                          changeType("specifique");
                          setProspectId(value);
                        }
                      }}
                    >
                      <option value="">Aucun prospect (standard)</option>
                      {prospects.map((prospect) => (
                        <option key={prospect.id} value={prospect.id}>
                          {prospect.nom} {prospect.prenom} ({prospect.email})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <ChatbotMissionField value={config.mission} onChange={changeMission} />
              <ChatbotBehaviorFields value={config} onChange={setConfig} />
            </section>
          ) : null}

          {step === 1 ? (
            <section className="chatbot-step-panel" aria-label={CHATBOT_STEPS[1].title}>
              <div className="chatbot-step-head">
                <h4>Collecte</h4>
                <p className="hint">
                  Choisissez la fiche que le chatbot remplira lorsque l’utilisateur veut recueillir
                  des informations.
                </p>
              </div>
              <ChatbotFichePicker
                value={config.fiches}
                onChange={(fiches) => setConfig((current) => ({ ...current, fiches }))}
              />
            </section>
          ) : null}

          {step === 2 ? (
            <section className="chatbot-step-panel" aria-label={CHATBOT_STEPS[2].title}>
              <div className="chatbot-step-head">
                <h4>Alimentation</h4>
                <p className="hint">
                  Les sources que le chatbot consulte et les contenus qu’il peut utiliser.
                </p>
              </div>
              <ChatbotDataStep
                value={dataDraft}
                onChange={setDataDraft}
                selection={config.dataSelection}
                onSelectionChange={(dataSelection) =>
                  setConfig((current) => ({ ...current, dataSelection }))
                }
                mediaSelection={config.mediaSelection}
                onMediaSelectionChange={(mediaSelection) =>
                  setConfig((current) => ({ ...current, mediaSelection }))
                }
                onGlobalCountsChange={setGlobalDataCounts}
                onUploadPhoto={uploadDraftPhoto}
                onRemovePhoto={removeDraftPhoto}
                searchTool={config.searchTool}
                onSearchToolChange={(searchTool) =>
                  setConfig((current) => ({ ...current, searchTool }))
                }
                fiches={config.fiches}
                publicLink={publicLink}
                sources={sources}
                onSourcesChange={setSources}
                usageHint={config.ficheUsageHint}
                onUsageHintChange={(ficheUsageHint) =>
                  setConfig((current) => ({ ...current, ficheUsageHint }))
                }
              />
            </section>
          ) : null}

          {step === 3 ? (
            <section className="chatbot-step-panel" aria-label={CHATBOT_STEPS[3].title}>
              <div className="chatbot-step-head">
                <h4>Publication</h4>
                <p className="hint">
                  Choisissez où le chatbot est publié, puis ajustez les options avancées de
                  diffusion.
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
                </div>
              </details>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="chatbot-step-panel" aria-label={CHATBOT_STEPS[4].title}>
              <div className="chatbot-step-head">
                <h4>IA & secours</h4>
                <p className="hint">
                  Choisissez les modèles IA et le comportement de secours si l’IA ne répond pas.
                </p>
              </div>
              <AiUsageOverridesField
                providers={aiProviders}
                value={aiUsage}
                onChange={setAiUsage}
                canAssign={canAssignAi}
              />
              <ChatbotFallbackFields
                value={config.fallback}
                onChange={(fallback) => setConfig((current) => ({ ...current, fallback }))}
              />
            </section>
          ) : null}

          {step === 5 ? (
            <section className="chatbot-step-panel" aria-label={CHATBOT_STEPS[5].title}>
              <div className="chatbot-step-head">
                <h4>Restrictions et quotas</h4>
                <p className="hint">Définissez les limites d’usage et l’expiration du chatbot.</p>
              </div>
              <div className="chatbot-card">
                <div className="chatbot-card-head">
                  <div>
                    <h2>Limites du chatbot</h2>
                    <p className="hint">Fiches, tokens et expiration du lien.</p>
                  </div>
                </div>
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
              </div>
            </section>
          ) : null}

          {step === 6 ? (
            <section className="chatbot-step-panel" aria-label={CHATBOT_STEPS[6].title}>
              <div className="chatbot-step-head">
                <h4>Validation</h4>
                <p className="hint">Vérifiez la configuration avant de créer le chatbot.</p>
              </div>
              <dl className="kv chatbot-summary">
                <dt>Prospect cible</dt>
                <dd>
                  {type === "specifique"
                    ? selectedProspect === null
                      ? "— Prospect non sélectionné —"
                      : `${selectedProspect.nom} ${selectedProspect.prenom} (${selectedProspect.email})`
                    : "Aucun prospect (standard)"}
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
                <dt>Sources</dt>
                <dd>
                  {config.mission === "collect"
                    ? "Désactivées par l’opération"
                    : [
                        config.searchTool.enabled ? "Fiches existantes" : "",
                        sources.connaissances ? "Connaissances" : "",
                        sources.phototheque ? "Photos" : "",
                        sources.lien ? "Liens" : "",
                      ]
                        .filter((entry) => entry !== "")
                        .join(", ") || "Aucune source active"}
                </dd>
                <dt>Contenus ajoutés</dt>
                <dd>
                  {pendingDataCount === 0
                    ? "Aucune"
                    : [
                        dataDraft.connaissances.length > 0
                          ? `${dataDraft.connaissances.length} connaissance(s)`
                          : "",
                        dataDraft.liens.length > 0 ? `${dataDraft.liens.length} lien(s)` : "",
                        dataDraft.photos.length > 0 ? `${dataDraft.photos.length} photo(s)` : "",
                      ]
                        .filter((entry) => entry !== "")
                        .join(" · ")}
                </dd>
                <dt>Sources d’information</dt>
                <dd>
                  Connaissances :{" "}
                  {config.dataSelection.mode === "all"
                    ? `global + ce chatbot (${globalDataCounts.connaissances})`
                    : `${config.dataSelection.connaissanceIds.length} sélectionnée(s)`}
                  {" · "}Médias :{" "}
                  {config.mediaSelection.mode === "all"
                    ? `global + ce chatbot (${globalDataCounts.photos + globalDataCounts.liens})`
                    : `${config.mediaSelection.mediaIds.length} sélectionné(s)`}
                </dd>
                <dt>Configuration IA</dt>
                <dd>
                  {Object.keys(aiUsage).length === 0
                    ? "Réglages par défaut de l’organisation"
                    : `${Object.keys(aiUsage).length} usage(s) personnalisé(s)`}
                </dd>
                <dt>Canaux</dt>
                <dd>
                  {enabledChannels.length === 0
                    ? "— Aucun —"
                    : enabledChannels
                        .map((channel) => (channel === "page" ? "Page publique" : "Widget"))
                        .join(", ")}
                </dd>
                <dt>Secours</dt>
                <dd>
                  {config.fallback.enabled
                    ? `${config.fallback.questions.length} question(s)${config.fallback.showCollectionForm ? " · fiche de collecte" : ""}`
                    : "Désactivé"}
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
                <li className="ok">
                  {config.fiches.length === 0
                    ? "Aucune fiche de collecte"
                    : `${config.fiches.length} fiche${config.fiches.length > 1 ? "s" : ""} de collecte`}
                </li>
                <li className="ok">
                  {config.dataSelection.mode === "all" && config.mediaSelection.mode === "all"
                    ? "Contenus globaux + ceux de ce chatbot"
                    : `${config.dataSelection.connaissanceIds.length} connaissance(s) · ${config.mediaSelection.mediaIds.length} média(s) sélectionné(s)`}
                  {pendingDataCount === 0
                    ? ""
                    : ` · ${pendingDataCount} contenu(s) ajouté(s) à ce chatbot`}
                </li>
                <li className={enabledChannels.length > 0 ? "ok" : "warn"}>
                  Au moins un canal de publication
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
            {stepPosition > 0 ? (
              <button type="button" className="btn ghost small" disabled={pending} onClick={goBack}>
                Retour
              </button>
            ) : (
              <button
                type="button"
                className="btn ghost small"
                disabled={pending}
                onClick={() => void cancelWizard()}
              >
                Annuler
              </button>
            )}
          </div>
          <div className="tools">
            <span className="hint chatbot-draft-save-status" aria-live="polite">
              {savingDraft
                ? "Sauvegarde du brouillon…"
                : saveError !== null
                  ? "Sauvegarde en échec"
                  : draftMeaningful
                    ? "Brouillon enregistré"
                    : ""}
            </span>
            <span className="hint chatbot-step-counter">
              Étape {stepPosition + 1} / {stepIndices.length}
            </span>
            {stepPosition < stepIndices.length - 1 ? (
              <button type="button" className="btn small" disabled={pending} onClick={goNext}>
                Suivant
              </button>
            ) : null}
            {canFinish ? (
              <button
                type="button"
                className="btn small"
                disabled={pending}
                onClick={() => void createChatbot()}
              >
                {pending ? "Création…" : "Terminer"}
              </button>
            ) : null}
          </div>
        </div>
      </form>
      {connaissanceConflicts === null ? null : (
        <ConnaissanceConflictModal
          conflicts={connaissanceConflicts}
          onClose={() => setConnaissanceConflicts(null)}
          onResolve={(action) => {
            setConnaissanceConflicts(null);
            void createChatbot(action);
          }}
        />
      )}
    </>
  );
}
