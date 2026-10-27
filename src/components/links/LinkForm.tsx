"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import {
  CHAT_LINK_TYPES,
  type ChatLinkSources,
  type ChatLinkSurface,
  type ChatLinkType,
  DEFAULT_LINK_SOURCES,
} from "@/domain/entities/chat";
import { AiAssignmentField, type LinkAiValue } from "./AiAssignmentField";
import { type ChannelDrafts, channelApiPayload, LinkChannelsFields } from "./LinkChannelsFields";
import { LinkDataBindingsField } from "./LinkDataBindingsField";
import { SourcesField } from "./SourcesField";
import type {
  AiProviderOption,
  ConfidentialiteOption,
  CreatedLink,
  ProspectOption,
  TemplateOption,
  VisualTemplateOption,
} from "./types";
import { UserStateField } from "./UserStateField";
import {
  parseVisualTemplateSelection,
  widgetDisplayForSelection,
} from "./visual-template-selection";

type LinkFormProps = {
  prospects: ProspectOption[];
  templates: TemplateOption[];
  confidentialites: ConfidentialiteOption[];
  visualTemplates: VisualTemplateOption[];
  aiProviders: AiProviderOption[];
  canAssignAi: boolean;
  onCreated: (created: CreatedLink) => void;
  onCancel: () => void;
};

/** Formulaire de création d'un lien : modèle, type (+ prospect), expiration. */
export function LinkForm({
  prospects,
  templates,
  confidentialites,
  visualTemplates,
  aiProviders,
  canAssignAi,
  onCreated,
  onCancel,
}: LinkFormProps) {
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [templateKey, setTemplateKey] = useState("fiche-projet");
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
  const [dataBindings, setDataBindings] = useState<Record<string, string>>({});
  const [ai, setAi] = useState<LinkAiValue>({ aiProviderId: null, aiModel: null });
  const activeTemplate = parseVisualTemplateSelection(channels[activeChannel].visualTemplate);
  const widgetDisplay = widgetDisplayForSelection(visualTemplates, channels.widget.visualTemplate);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!channels.page.enabled && !channels.widget.enabled) {
      setError("Activez au moins un canal de diffusion");
      return;
    }
    if (channels.widget.enabled && widgetDisplay === null) {
      setError("Choisissez un template visuel compatible avec le widget");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey,
          type,
          ...(type === "specifique" ? { prospectId } : {}),
          ...(label.trim() === "" ? {} : { label: label.trim() }),
          ...(expiresAt === "" ? {} : { expiresAt }),
          sources,
          userStateEnabled,
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

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {error !== null ? <p className="alert error">{error}</p> : null}

      <label className="field">
        Modèle de raisonnement
        <select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}>
          {templates.map((template) => (
            <option key={template.key} value={template.key}>
              {template.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Type de lien
        <select
          value={type}
          onChange={(event) => {
            const next = event.target.value as ChatLinkType;
            setType(next);
            setChannels((current) => ({
              ...current,
              page: {
                ...current.page,
                identificationMode:
                  next === "specifique" ? "contact" : current.page.identificationMode,
              },
              widget: {
                ...current.widget,
                identificationMode:
                  next === "standard" ? "anonymous" : current.widget.identificationMode,
              },
            }));
          }}
        >
          {CHAT_LINK_TYPES.map((value) => (
            <option key={value} value={value}>
              {value === "specifique" ? "Spécifique à un prospect" : "Standard"}
            </option>
          ))}
        </select>
      </label>

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

      <SourcesField value={sources} onChange={setSources} />

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

      <div className="tools">
        <button type="submit" className="btn small" disabled={pending}>
          {pending ? "Création…" : "Créer le lien"}
        </button>
        <button type="button" className="btn ghost small" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
