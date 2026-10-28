"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryPicker } from "@/components/categories/CategoryPicker";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import {
  type ChatLinkChannel,
  type ChatLinkSources,
  type ChatLinkSurface,
  channelsForLink,
  chatLinkQuota,
} from "@/domain/entities/chat";
import { AiAssignmentField, type LinkAiValue } from "./AiAssignmentField";
import { ChatbotConfigFields } from "./ChatbotConfigFields";
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
  const [ai, setAi] = useState<LinkAiValue>({
    aiProviderId: link.aiProviderId,
    aiModel: link.aiModel,
  });
  const [config, setConfig] = useState<ChatbotConfigDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
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

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (channels.widget.enabled && widgetDisplay === null) {
      setError("Choisissez un template visuel compatible avec le widget");
      return;
    }
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

  return (
    <div className="modal-overlay">
      <button type="button" className="modal-backdrop" aria-label="Fermer" onClick={onClose} />
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Modifier le lien"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="modal-head">
          <h3>Modifier le lien</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          <form className="form" onSubmit={onSubmit} noValidate>
            {error !== null ? <p className="alert error">{error}</p> : null}

            <p className="hint">
              Type : <span className="badge">{link.type}</span> — non modifiable.
            </p>

            <LinkChannelsFields
              value={channels}
              onChange={setChannels}
              active={activeChannel}
              onActiveChange={setActiveChannel}
              type={link.type}
              visualTemplates={visualTemplates}
              confidentialites={confidentialites}
            />

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

            <CategoryPicker contentType="link" contentId={link.id} />

            {config !== null ? <ChatbotConfigFields value={config} onChange={setConfig} /> : null}

            <SourcesField value={sources} onChange={setSources} />

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

            <label className="field">
              Expiration (vide = sans expiration)
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <span className="hint">Le lien reste valide jusqu&apos;à la fin du jour choisi.</span>
            </label>

            <div className="tools">
              <button type="submit" className="btn small" disabled={pending}>
                {pending ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button type="button" className="btn ghost small" onClick={onClose}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
