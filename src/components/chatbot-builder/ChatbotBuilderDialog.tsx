"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredChatbotBuildSession } from "@/application/ports/chatbot-build-session-repository";
import type { ChatbotBuilderGeneration } from "@/application/use-cases/chatbot-builder/manage-chatbot-builder";
import type { ConnaissanceConflict } from "@/application/use-cases/connaissances/resolve-connaissance-conflicts";
import { ConnaissanceConflictModal } from "@/components/links/ConnaissanceConflictModal";
import { chatbotConfigPayload } from "@/components/links/chatbot-config-draft";
import {
  type ConnaissanceConflictResolution,
  chatbotDataDraftCount,
  checkConnaissanceConflicts,
  submitChatbotDataDraft,
} from "@/components/links/chatbot-data-draft";
import { channelApiPayload } from "@/components/links/LinkChannelsFields";
import type { CreatedLink } from "@/components/links/types";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { BUILD_REQUIREMENT_LABELS, type ChatbotBuildSession } from "@/domain/chatbot-builder";
import { isPublicChatLink } from "@/domain/entities/chat";
import { builderGenerationToDraftState, serializeBuilderDraftState } from "./builder-to-draft";

const SESSION_KEY = "onir-chatbot-builder-session";

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(json.error ?? "Une erreur est survenue");
  return json;
}

function missionLabel(mission: ChatbotBuildSession["brief"]["mission"]): string {
  if (mission === "collect") return "Collecte";
  if (mission === "inform") return "Information";
  if (mission === "hybrid") return "Hybride";
  return "À définir";
}

function sourceLabel(session: ChatbotBuildSession): string {
  const { brief } = session;
  const sources: string[] = [];
  if (brief.sources.websiteUrl !== null) sources.push("Site web");
  if (brief.sources.documents.length > 0) {
    sources.push(`${brief.sources.documents.length} document(s)`);
  }
  if (brief.sources.useDescriptionAsSource) sources.push("Texte fourni");
  if (brief.sources.intent.fiches && brief.sources.ficheTypes.length > 0) {
    sources.push(`${brief.sources.ficheTypes.length} fiche(s) existante(s)`);
  }
  if (sources.length === 0) return "À définir";
  return brief.mission === "collect"
    ? `${sources.join(" + ")} (contexte de génération)`
    : sources.join(" + ");
}

function fileMetadata(files: File[]): Array<{ name: string; size: number }> {
  return files.map((file) => ({ name: file.name, size: file.size }));
}

function BriefIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M15 5v14" />
      <path d="M8 9h4M8 12h4" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.5 12.5l5.8-5.8a3 3 0 0 1 4.2 4.2l-7.4 7.4a5 5 0 0 1-7.1-7.1l7-7" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 3L10 14" />
      <path d="M21 3l-6.5 18-4.5-7-7-4.5L21 3z" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l1.3 4.2L17.5 8.5l-4.2 1.3L12 14l-1.3-4.2L6.5 8.5l4.2-1.3L12 3z" />
      <path d="M18.5 14l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

export function ChatbotBuilderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [session, setSession] = useState<ChatbotBuildSession | null>(null);
  const [generation, setGeneration] = useState<ChatbotBuilderGeneration | null>(null);
  const [input, setInput] = useState("");
  const [websiteInput, setWebsiteInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [sourcePending, setSourcePending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingAsDraft, setSavingAsDraft] = useState(false);
  const [conflicts, setConflicts] = useState<ConnaissanceConflict[] | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [linkPanelOpen, setLinkPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applySession = useCallback((stored: StoredChatbotBuildSession) => {
    setDraftId(stored.draftId);
    setSession(stored.session);
    setWebsiteInput(stored.session.brief.sources.websiteUrl ?? "");
    window.localStorage.setItem(SESSION_KEY, stored.draftId);
  }, []);

  const start = useCallback(async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const stored = await readJson<StoredChatbotBuildSession>(
        await fetch("/api/chatbots/ai/builder/sessions", { method: "POST" }),
      );
      setGeneration(null);
      setFiles([]);
      applySession(stored);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de démarrer la session");
    } finally {
      setPending(false);
    }
  }, [applySession]);

  useEffect(() => {
    if (!open || initializedRef.current) return;
    initializedRef.current = true;
    const savedId = window.localStorage.getItem(SESSION_KEY);
    if (savedId === null) {
      void start();
      return;
    }
    setPending(true);
    void fetch(`/api/chatbots/ai/builder/sessions/${savedId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("session");
        return readJson<StoredChatbotBuildSession>(response);
      })
      .then((stored) => applySession(stored))
      .catch(() => {
        window.localStorage.removeItem(SESSION_KEY);
        void start();
      })
      .finally(() => setPending(false));
  }, [open, start, applySession]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null || session === null) return;
    element.scrollTop = element.scrollHeight;
    if (pending) element.scrollTop = element.scrollHeight;
  }, [session, pending]);

  const send = async (value?: string): Promise<void> => {
    const message = (value ?? input).trim();
    if (message === "" || session === null || draftId === null || pending) return;
    setPending(true);
    setError(null);
    try {
      const stored = await readJson<StoredChatbotBuildSession>(
        await fetch(`/api/chatbots/ai/builder/sessions/${draftId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        }),
      );
      applySession(stored);
      setInput("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le message n’a pas pu être traité");
    } finally {
      setPending(false);
    }
  };

  const saveSources = async (
    websiteUrl: string,
    documents: Array<{ name: string; size: number }>,
    useDescriptionAsSource = session?.brief.sources.useDescriptionAsSource ?? false,
  ): Promise<void> => {
    if (draftId === null) return;
    setSourcePending(true);
    setError(null);
    try {
      const stored = await readJson<StoredChatbotBuildSession>(
        await fetch(`/api/chatbots/ai/builder/sessions/${draftId}/sources`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteUrl, documents, useDescriptionAsSource }),
        }),
      );
      applySession(stored);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Les sources n’ont pas pu être enregistrées",
      );
    } finally {
      setSourcePending(false);
    }
  };

  const addFiles = (selected: FileList | null): void => {
    if (selected === null) return;
    const next = [...files, ...Array.from(selected)].slice(0, 5);
    setFiles(next);
    void saveSources(
      session?.brief.sources.websiteUrl ?? "",
      fileMetadata(next),
      session?.brief.sources.useDescriptionAsSource ?? false,
    );
    if (fileInputRef.current !== null) fileInputRef.current.value = "";
  };

  const removeDocument = (name: string): void => {
    const nextFiles = files.filter((file) => file.name !== name);
    setFiles(nextFiles);
    const remaining = (session?.brief.sources.documents ?? []).filter(
      (document) => document.name !== name,
    );
    void saveSources(
      session?.brief.sources.websiteUrl ?? "",
      remaining,
      session?.brief.sources.useDescriptionAsSource ?? false,
    );
  };

  const generate = async (): Promise<void> => {
    if (session === null || draftId === null || session.missingMandatory.length > 0) return;
    if (session.brief.sources.documents.length > 0 && files.length === 0) {
      setError("Rattachez à nouveau les documents avant de générer.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const formData = new FormData();
      for (const file of files) formData.append("files", file);
      const result = await readJson<ChatbotBuilderGeneration>(
        await fetch(`/api/chatbots/ai/builder/sessions/${draftId}/generate`, {
          method: "POST",
          body: formData,
        }),
      );
      setGeneration(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La génération a échoué");
    } finally {
      setGenerating(false);
    }
  };

  const cleanupBuilderSession = (): void => {
    window.localStorage.removeItem(SESSION_KEY);
    if (draftId !== null) {
      void fetch(`/api/chatbots/ai/builder/sessions/${draftId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
  };

  const cancelGeneration = (): void => {
    cleanupBuilderSession();
    setGeneration(null);
    onClose();
  };

  const saveAsDraft = async (): Promise<void> => {
    if (generation === null) return;
    setSavingAsDraft(true);
    setError(null);
    try {
      await readJson<{ draft: { id: string } }>(
        await fetch("/api/chatbot-drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: generation.draft.label,
            state: serializeBuilderDraftState(generation),
          }),
        }),
      );
      cleanupBuilderSession();
      toast.success("Brouillon enregistré.");
      onClose();
      router.push("/liens");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le brouillon n’a pas pu être enregistré");
    } finally {
      setSavingAsDraft(false);
    }
  };

  const createChatbot = async (conflictAction?: "update" | "keep"): Promise<void> => {
    if (generation === null || draftId === null) return;
    const state = builderGenerationToDraftState(generation);
    if (
      conflictAction === undefined &&
      state.config.mission !== "collect" &&
      state.dataDraft.connaissances.length > 0
    ) {
      try {
        const found = await checkConnaissanceConflicts(state.dataDraft.connaissances);
        if (found.length > 0) {
          setConflicts(found);
          return;
        }
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Vérification des connaissances impossible",
        );
        return;
      }
    }

    setCreating(true);
    setError(null);
    try {
      const conflictIds =
        conflictAction === "update" && conflicts !== null
          ? conflicts.map((conflict) => conflict.existingId)
          : [];
      const configForCreate =
        conflictIds.length > 0 && state.config.dataSelection.mode === "selected"
          ? {
              ...state.config,
              dataSelection: {
                ...state.config.dataSelection,
                connaissanceIds: [
                  ...new Set([...state.config.dataSelection.connaissanceIds, ...conflictIds]),
                ],
              },
            }
          : state.config;
      const publicLink = isPublicChatLink(state.channels);
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: chatbotConfigPayload(configForCreate, {
            publicLink,
            sources: state.sources,
          }),
          type: state.type,
          ...(state.type === "specifique" ? { prospectId: state.prospectId } : {}),
          ...(state.label.trim() === "" ? {} : { label: state.label.trim() }),
          ...(state.expiresAt === "" ? {} : { expiresAt: state.expiresAt }),
          sources: state.sources,
          userStateEnabled: state.userStateEnabled,
          maxFiches: state.quota.maxFiches === "" ? null : Number(state.quota.maxFiches),
          maxTokens: state.quota.maxTokens === "" ? null : Number(state.quota.maxTokens),
          tokenResetMode: state.quota.tokenResetMode,
          tokenResetDays:
            state.quota.tokenResetMode === "duration" && state.quota.tokenResetDays !== ""
              ? Number(state.quota.tokenResetDays)
              : null,
          aiProviderId: state.ai.aiProviderId,
          aiModel: state.ai.aiModel,
          channels: {
            page: channelApiPayload(state.channels.page),
            widget: channelApiPayload(state.channels.widget),
          },
          dataBindings: state.dataBindings,
        }),
      });
      const json = (await response.json()) as CreatedLink & { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Création impossible");
        return;
      }

      const resolutions: ConnaissanceConflictResolution[] =
        conflictAction === undefined || conflicts === null
          ? []
          : conflicts.map((conflict) => ({
              titre: conflict.titre,
              existingId: conflict.existingId,
              existingChatLinkIds: conflict.existingChatLinkIds,
              action: conflictAction,
            }));
      if (chatbotDataDraftCount(state.dataDraft) > 0 && state.config.mission !== "collect") {
        try {
          const result = await submitChatbotDataDraft(state.dataDraft, json.link.id, resolutions);
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
          if (result.failures.length > 0) {
            toast.warning(
              `Chatbot créé, mais ${result.failures.length} ajout(s) de données ont échoué.`,
            );
          }
        } catch {
          toast.warning("Chatbot créé, mais les données n’ont pas pu être ajoutées.");
        }
      }

      cleanupBuilderSession();
      toast.success("Chatbot créé.");
      onClose();
      router.push("/liens");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "La création du chatbot a échoué");
    } finally {
      setCreating(false);
    }
  };

  const startOver = (): void => {
    cleanupBuilderSession();
    setDraftId(null);
    setSession(null);
    setGeneration(null);
    setFiles([]);
    setWebsiteInput("");
    setConflicts(null);
    setError(null);
    void start();
  };

  const documents = session?.brief.sources.documents ?? [];
  const missingLabels = (session?.missingMandatory ?? []).map(
    (requirement) => BUILD_REQUIREMENT_LABELS[requirement],
  );
  const canGenerate =
    session !== null &&
    session.missingMandatory.length === 0 &&
    !pending &&
    !generating &&
    generation === null;
  const generatedState = generation === null ? null : builderGenerationToDraftState(generation);
  const handleClose = (): void => {
    if (generation === null) {
      onClose();
      return;
    }
    cancelGeneration();
  };

  return (
    <>
      <Modal
        title={generation === null ? "Créer un chatbot avec l’IA" : "Validation du chatbot"}
        onClose={handleClose}
        wide
        dialogClassName={
          generation === null ? "chatbot-builder-modal" : "chatbot-builder-review-modal"
        }
        bodyClassName={
          generation === null
            ? "chatbot-builder-body"
            : "chatbot-builder-body chatbot-builder-review-body"
        }
      >
        {session === null ? (
          <div className="chatbot-builder-loading">
            <p>{error ?? "Initialisation de l’assistant…"}</p>
            {error === null ? null : (
              <button type="button" className="btn" onClick={() => void start()}>
                Réessayer
              </button>
            )}
          </div>
        ) : generation === null ? (
          <div className={`chatbot-builder-layout${briefOpen ? " has-brief" : ""}`}>
            <section className="chatbot-builder-chat" aria-label="Conversation de création">
              <div className="chatbot-builder-chat-toolbar">
                <button
                  type="button"
                  className="chatbot-builder-icon-btn"
                  onClick={() => setBriefOpen((current) => !current)}
                  aria-label={briefOpen ? "Masquer le brief" : "Afficher le brief"}
                  aria-expanded={briefOpen}
                  title={briefOpen ? "Masquer le brief" : "Afficher le brief"}
                >
                  <BriefIcon />
                </button>
                <button
                  type="button"
                  className="chatbot-builder-icon-btn"
                  onClick={startOver}
                  disabled={pending || sourcePending || generating}
                  aria-label="Nouvelle conversation"
                  title="Nouvelle conversation"
                >
                  <RefreshIcon />
                </button>
              </div>
              <div className="chatbot-builder-messages" ref={scrollRef}>
                {session.messages.map((message) => (
                  <div
                    key={`${message.role}:${message.content}`}
                    className={`chatbot-builder-message ${message.role}`}
                  >
                    {message.role === "assistant" ? (
                      <span className="chatbot-builder-avatar" aria-hidden="true">
                        ✦
                      </span>
                    ) : null}
                    <div>{message.content}</div>
                  </div>
                ))}
                {pending ? (
                  <div className="chatbot-builder-message assistant">
                    <span className="chatbot-builder-avatar" aria-hidden="true">
                      ✦
                    </span>
                    <div className="chatbot-builder-typing">L’assistant réfléchit…</div>
                  </div>
                ) : null}
              </div>

              {session.suggestions.length > 0 && !pending ? (
                <div className="chatbot-builder-suggestions">
                  {session.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="chatbot-builder-suggestion"
                      onClick={() => void send(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}

              {error === null ? null : (
                <p className="chatbot-builder-error" role="alert">
                  {error}
                </p>
              )}

              {linkPanelOpen ? (
                <div className="chatbot-builder-link-panel">
                  <input
                    type="url"
                    value={websiteInput}
                    onChange={(event) => setWebsiteInput(event.target.value)}
                    placeholder="https://exemple.com"
                    aria-label="URL du site à ajouter"
                    disabled={sourcePending}
                  />
                  <button
                    type="button"
                    className="chatbot-builder-icon-btn"
                    title="Ajouter ce lien"
                    aria-label="Ajouter ce lien"
                    disabled={sourcePending || websiteInput.trim() === ""}
                    onClick={() => {
                      void saveSources(
                        websiteInput.trim(),
                        documents,
                        session.brief.sources.useDescriptionAsSource,
                      ).then(() => setLinkPanelOpen(false));
                    }}
                  >
                    <SendIcon />
                  </button>
                  <button
                    type="button"
                    className="chatbot-builder-icon-btn"
                    title="Fermer"
                    aria-label="Fermer l’ajout de lien"
                    onClick={() => setLinkPanelOpen(false)}
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <form
                className="chatbot-builder-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <div className="chatbot-builder-composer-tools">
                  <button
                    type="button"
                    className="chatbot-builder-icon-btn"
                    title="Joindre un document"
                    aria-label="Joindre un document"
                    disabled={sourcePending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <PaperclipIcon />
                  </button>
                  <button
                    type="button"
                    className="chatbot-builder-icon-btn"
                    title="Ajouter un lien"
                    aria-label="Ajouter un lien"
                    disabled={sourcePending}
                    onClick={() => setLinkPanelOpen((current) => !current)}
                  >
                    <LinkIcon />
                  </button>
                </div>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  placeholder="Répondez à l’assistant…"
                  maxLength={4_000}
                  disabled={pending}
                  aria-label="Votre message"
                />
                <div className="chatbot-builder-composer-actions">
                  <button
                    type="button"
                    className="chatbot-builder-icon-btn generate"
                    title={canGenerate ? "Générer le chatbot" : "Complétez le brief pour générer"}
                    aria-label="Générer le chatbot"
                    disabled={!canGenerate || sourcePending}
                    onClick={() => void generate()}
                  >
                    <SparklesIcon />
                  </button>
                  <button
                    type="submit"
                    className="chatbot-builder-icon-btn send"
                    title="Envoyer"
                    aria-label="Envoyer le message"
                    disabled={input.trim() === "" || pending}
                  >
                    <SendIcon />
                  </button>
                </div>
              </form>
              <input
                ref={fileInputRef}
                id="chatbot-builder-files"
                className="sr-only"
                type="file"
                multiple
                accept=".pdf,.docx,.odt,.md,.rtf,.txt"
                onChange={(event) => addFiles(event.target.files)}
                disabled={sourcePending}
                aria-label="Ajouter des documents"
              />
            </section>

            {briefOpen ? (
              <aside className="chatbot-builder-summary" aria-label="Résumé du chatbot">
                <div className="chatbot-builder-summary-head">
                  <div>
                    <span className="eyebrow">Brief en cours</span>
                    <h4>{session.brief.identity.label ?? "Nouveau chatbot"}</h4>
                  </div>
                  <div className="chatbot-builder-summary-actions">
                    <span className="chatbot-builder-status">
                      {session.status === "ready" ? "Prêt à générer" : "À compléter"}
                    </span>
                    <button
                      type="button"
                      className="chatbot-builder-icon-btn"
                      onClick={() => setBriefOpen(false)}
                      aria-label="Masquer le brief"
                      title="Masquer le brief"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <dl className="chatbot-builder-facts">
                  <div>
                    <dt>Mission</dt>
                    <dd>{missionLabel(session.brief.mission)}</dd>
                  </div>
                  <div>
                    <dt>Sources</dt>
                    <dd>{sourceLabel(session)}</dd>
                  </div>
                  <div>
                    <dt>Collecte</dt>
                    <dd>
                      {session.brief.mission === "collect" || session.brief.mission === "hybrid"
                        ? (session.brief.collectionGoal ?? "À définir")
                        : "Aucune fiche de collecte"}
                    </dd>
                  </div>
                  <div>
                    <dt>Mode d’édition</dt>
                    <dd>Guidé</dd>
                  </div>
                </dl>

                <div className="chatbot-builder-source-form">
                  {documents.length === 0 ? (
                    <span className="hint">
                      Aucun document ou site : le texte fourni sera utilisé comme source.
                    </span>
                  ) : null}
                  {documents.length > 0 ? (
                    <div className="chatbot-builder-documents">
                      {documents.map((document) => (
                        <span key={document.name} className="chatbot-builder-document">
                          {document.name}
                          <button
                            type="button"
                            onClick={() => removeDocument(document.name)}
                            aria-label={`Retirer ${document.name}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {files.length === 0 ? (
                        <span className="hint">
                          Les fichiers doivent être rattachés à nouveau après un rechargement.
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {missingLabels.length > 0 ? (
                  <div className="chatbot-builder-missing" role="status">
                    <strong>Il manque</strong>
                    <ul>
                      {missingLabels.map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="chatbot-builder-ready">Tous les prérequis sont réunis.</p>
                )}

                <p className="chatbot-builder-footnote">
                  Utilisez les icônes près du champ pour joindre un document, ajouter un lien ou
                  générer.
                </p>
              </aside>
            ) : null}
          </div>
        ) : (
          <div className="chatbot-builder-review">
            <div className="chatbot-step-head chatbot-builder-review-head">
              <div>
                <span className="eyebrow">Validation</span>
                <h3>{generation.draft.label}</h3>
                <p>Vérifiez la configuration avant de créer le chatbot.</p>
              </div>
              <span className="chatbot-builder-status">Prêt à relire</span>
            </div>

            <dl className="kv chatbot-builder-review-summary">
              <dt>Description</dt>
              <dd>{generation.draft.description || "—"}</dd>
              <dt>Rôle</dt>
              <dd>{generation.draft.role || "—"}</dd>
              <dt>Objectif</dt>
              <dd>{generation.draft.objective || "—"}</dd>
              <dt>Mission</dt>
              <dd>{missionLabel(generation.mission)}</dd>
              <dt>Sources</dt>
              <dd>
                {[
                  session?.brief.sources.websiteUrl ? "Site web" : "",
                  generation.sources.files.length > 0
                    ? `${generation.sources.files.length} document(s)`
                    : "",
                  session?.brief.sources.useDescriptionAsSource ? "Texte fourni" : "",
                  generatedState?.config.searchTool.enabled ? "Fiches existantes" : "",
                ]
                  .filter((entry) => entry !== "")
                  .join(" + ") || "Aucune"}
              </dd>
              <dt>Documents</dt>
              <dd>
                {session?.brief.sources.documents.length
                  ? session.brief.sources.documents.map((document) => document.name).join(", ")
                  : "Aucun"}
              </dd>
              <dt>Fiches</dt>
              <dd>
                {generation.mission === "inform"
                  ? "Aucune (mission informative)"
                  : generatedState?.config.fiches.length
                    ? generatedState.config.fiches
                        .map((fiche) => fiche.label || fiche.key)
                        .join(", ")
                    : "Aucune"}
              </dd>
              <dt>Champs de collecte</dt>
              <dd>
                {generation.mission === "inform"
                  ? "Aucun"
                  : `${generation.draft.fields.length} champ(s) : ${
                      generation.draft.fields.map((field) => field.label).join(", ") || "—"
                    }`}
              </dd>
              <dt>Connaissances</dt>
              <dd>
                {generatedState?.dataDraft.connaissances.length
                  ? generatedState.dataDraft.connaissances.map((item) => item.titre).join(" · ")
                  : "Aucune"}
              </dd>
              <dt>Comportement</dt>
              <dd>
                Guidé ·{" "}
                {generation.draft.language.mode === "auto"
                  ? "langue automatique"
                  : generation.draft.language.value}
                {generation.draft.tone ? ` · ton ${generation.draft.tone}` : ""}
              </dd>
              <dt>Garde-fous</dt>
              <dd>
                {generation.draft.guardrails.length
                  ? generation.draft.guardrails.join(" · ")
                  : "Aucun"}
              </dd>
              <dt>Secours</dt>
              <dd>
                {generation.draft.fallback.enabled
                  ? `${generation.draft.fallback.questions.length} question(s)${generation.draft.fallback.showCollectionForm ? " · fiche de collecte" : ""}`
                  : "Désactivé"}
              </dd>
              <dt>Canaux</dt>
              <dd>
                {[
                  generatedState?.channels.page.enabled ? "Page publique" : "",
                  generatedState?.channels.widget.enabled ? "Widget" : "",
                ]
                  .filter((entry) => entry !== "")
                  .join(", ") || "Aucun"}
              </dd>
              <dt>Quotas</dt>
              <dd>
                Réponse max. {generatedState?.config.replyMaxTokens ?? 400} tokens · fiches{" "}
                {generatedState?.quota.maxFiches || "illimitées"} · tokens{" "}
                {generatedState?.quota.maxTokens || "illimités"}
              </dd>
              <dt>Expiration</dt>
              <dd>{generatedState?.expiresAt || "Sans expiration"}</dd>
              <dt>Modèle IA</dt>
              <dd>
                {generation.providerLabel} · {generation.model}
              </dd>
            </dl>

            <ul className="chatbot-checklist">
              <li
                className={
                  generation.sourceIntent.connaissances || generation.sources.files.length > 0
                    ? "ok"
                    : "warn"
                }
              >
                Au moins une source d’information
              </li>
              <li className="ok">
                {generation.mission === "inform"
                  ? "Aucune fiche de collecte en mission informative"
                  : `${generation.draft.fields.length} champ(s) de collecte`}
              </li>
              <li
                className={
                  generatedState &&
                  (generatedState.channels.page.enabled || generatedState.channels.widget.enabled)
                    ? "ok"
                    : "warn"
                }
              >
                Au moins un canal de publication
              </li>
              <li className="ok">Prompt guidé généré</li>
            </ul>

            {generation.warnings.length > 0 ? (
              <div className="chatbot-builder-warnings">
                <strong>Avertissements</strong>
                <ul>
                  {generation.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {error === null ? null : (
              <p className="chatbot-builder-error" role="alert">
                {error}
              </p>
            )}

            <div className="chatbot-builder-actions chatbot-builder-review-actions">
              <button
                type="button"
                className="btn"
                onClick={() => void createChatbot()}
                disabled={creating || savingAsDraft}
              >
                {creating ? "Création…" : "Créer le chatbot"}
              </button>
              <button
                type="button"
                className="btn subtle"
                onClick={() => void saveAsDraft()}
                disabled={creating || savingAsDraft}
              >
                {savingAsDraft ? "Enregistrement…" : "Le garder en brouillon"}
              </button>
              <button
                type="button"
                className="btn subtle"
                onClick={() => setGeneration(null)}
                disabled={creating || savingAsDraft}
              >
                Régénérer
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={cancelGeneration}
                disabled={creating || savingAsDraft}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </Modal>
      {conflicts === null ? null : (
        <ConnaissanceConflictModal
          conflicts={conflicts}
          onClose={() => setConflicts(null)}
          onResolve={(action) => {
            setConflicts(null);
            void createChatbot(action);
          }}
        />
      )}
    </>
  );
}
