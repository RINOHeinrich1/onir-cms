"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import {
  ACTIVE_LINK_IDENTIFICATION_MODES,
  type ActiveLinkIdentificationMode,
  CHAT_LINK_TYPES,
  type ChatLinkSources,
  type ChatLinkType,
  DEFAULT_LINK_SOURCES,
} from "@/domain/entities/chat";
import type { TemplateParamValues } from "@/domain/template-params";
import { AiAssignmentField, type LinkAiValue } from "./AiAssignmentField";
import { LinkDataBindingsField } from "./LinkDataBindingsField";
import { SourcesField } from "./SourcesField";
import { TemplateParamsFields } from "./TemplateParamsFields";
import type {
  AiProviderOption,
  ConfidentialiteOption,
  ProspectOption,
  TemplateOption,
  VisualTemplateOption,
} from "./types";
import { UserStateField } from "./UserStateField";
import {
  defaultsForSchema,
  paramsSchemaForSelection,
  parseVisualTemplateSelection,
} from "./visual-template-selection";

type LinkFormProps = {
  prospects: ProspectOption[];
  templates: TemplateOption[];
  confidentialites: ConfidentialiteOption[];
  visualTemplates: VisualTemplateOption[];
  aiProviders: AiProviderOption[];
  canAssignAi: boolean;
  onCreated: () => void;
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
  const [pending, setPending] = useState(false);
  const [templateKey, setTemplateKey] = useState("fiche-projet");
  const [type, setType] = useState<ChatLinkType>("specifique");
  const [identificationMode, setIdentificationMode] =
    useState<ActiveLinkIdentificationMode>("contact");
  const [prospectId, setProspectId] = useState("");
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sources, setSources] = useState<ChatLinkSources>({ ...DEFAULT_LINK_SOURCES });
  const [userStateEnabled, setUserStateEnabled] = useState(false);
  const [confidentialiteId, setConfidentialiteId] = useState<string>(confidentialites[0]?.id ?? "");
  const [visualTemplate, setVisualTemplate] = useState<string>("");
  const [params, setParams] = useState<TemplateParamValues>({});
  const [dataBindings, setDataBindings] = useState<Record<string, string>>({});
  const [ai, setAi] = useState<LinkAiValue>({ aiProviderId: null, aiModel: null });
  const paramsSchema = paramsSchemaForSelection(visualTemplates, visualTemplate);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey,
          type,
          identificationMode,
          ...(type === "specifique" ? { prospectId } : {}),
          ...(label.trim() === "" ? {} : { label: label.trim() }),
          ...(expiresAt === "" ? {} : { expiresAt }),
          sources,
          confidentialiteId,
          userStateEnabled,
          aiProviderId: ai.aiProviderId,
          aiModel: ai.aiModel,
          ...(() => {
            const parsed = parseVisualTemplateSelection(visualTemplate);
            return {
              visualTemplateId: parsed.id,
              visualTemplateVersion: parsed.version,
              visualTemplateParams: params,
              dataBindings,
            };
          })(),
        }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Création impossible");
        return;
      }
      onCreated();
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
            if (next === "specifique") setIdentificationMode("contact");
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
        <>
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
          </label>
          <p className="hint">
            Identification : prospect lié au lien. Le visiteur n&apos;a pas de formulaire.
          </p>
        </>
      ) : (
        <>
          <label className="field">
            Identification
            <select
              value={identificationMode}
              onChange={(event) =>
                setIdentificationMode(event.target.value as ActiveLinkIdentificationMode)
              }
            >
              {ACTIVE_LINK_IDENTIFICATION_MODES.map((value) => (
                <option key={value} value={value}>
                  {value === "contact" ? "Nom et contact" : "Anonyme"}
                </option>
              ))}
            </select>
            <span className="hint">
              {identificationMode === "contact"
                ? "Le visiteur doit fournir son nom et son email avant de discuter."
                : "Aucun nom, email ou contact demandé. La conversation est liée à aucun prospect."}
            </span>
          </label>
          <p className="hint">
            Les modes OTP par email et utilisateur interne seront disponibles ultérieurement.
          </p>
        </>
      )}

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

      <label className="field">
        Confidentialité
        <select
          value={confidentialiteId}
          onChange={(event) => setConfidentialiteId(event.target.value)}
        >
          <option value="">— Aucune —</option>
          {confidentialites.map((item) => (
            <option key={item.id} value={item.id}>
              {item.titre}
            </option>
          ))}
        </select>
        <span className="hint">Le visiteur devra accepter cette politique avant de discuter.</span>
      </label>

      <label className="field">
        Template visuel
        <select
          value={visualTemplate}
          onChange={(event) => {
            setVisualTemplate(event.target.value);
            setParams(
              defaultsForSchema(paramsSchemaForSelection(visualTemplates, event.target.value)),
            );
            setDataBindings({});
          }}
        >
          <option value="">— Défaut —</option>
          {visualTemplates.flatMap((item) =>
            item.versions.map((entry) => (
              <option key={`${item.id}@${entry.version}`} value={`${item.id}@${entry.version}`}>
                {item.name} ({entry.version})
              </option>
            )),
          )}
        </select>
        <span className="hint">
          Personnalise l&apos;interface publique du chat et du formulaire. Changer de template
          réinitialise ses paramètres aux valeurs par défaut.
        </span>
      </label>

      <TemplateParamsFields schema={paramsSchema} values={params} onChange={setParams} />
      <LinkDataBindingsField
        templateId={parseVisualTemplateSelection(visualTemplate).id}
        templateVersion={parseVisualTemplateSelection(visualTemplate).version}
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
