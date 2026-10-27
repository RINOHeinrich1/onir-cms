"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import {
  ACTIVE_LINK_IDENTIFICATION_MODES,
  type ActiveLinkIdentificationMode,
  CHAT_LINK_SURFACES,
  CHAT_LINK_TYPES,
  type ChatLinkSources,
  type ChatLinkSurface,
  type ChatLinkType,
  DEFAULT_LINK_SOURCES,
} from "@/domain/entities/chat";
import type { TemplateParamValues } from "@/domain/template-params";
import { WIDGET_POSITIONS, type WidgetPosition } from "@/domain/widget";
import { AiAssignmentField, type LinkAiValue } from "./AiAssignmentField";
import { LinkDataBindingsField } from "./LinkDataBindingsField";
import { SourcesField } from "./SourcesField";
import { TemplateParamsFields } from "./TemplateParamsFields";
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
  defaultsForSchema,
  paramsSchemaForSelection,
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
  const [surface, setSurface] = useState<ChatLinkSurface>("page");
  const [identificationMode, setIdentificationMode] =
    useState<ActiveLinkIdentificationMode>("contact");
  const [prospectId, setProspectId] = useState("");
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sources, setSources] = useState<ChatLinkSources>({ ...DEFAULT_LINK_SOURCES });
  const [userStateEnabled, setUserStateEnabled] = useState(false);
  const [confidentialiteId, setConfidentialiteId] = useState<string>(confidentialites[0]?.id ?? "");
  const [visualTemplate, setVisualTemplate] = useState<string>("");
  const [widgetPosition, setWidgetPosition] = useState<WidgetPosition>("bottom-right");
  const [params, setParams] = useState<TemplateParamValues>({});
  const [dataBindings, setDataBindings] = useState<Record<string, string>>({});
  const [ai, setAi] = useState<LinkAiValue>({ aiProviderId: null, aiModel: null });
  const paramsSchema = paramsSchemaForSelection(visualTemplates, visualTemplate);
  const widgetDisplay = widgetDisplayForSelection(visualTemplates, visualTemplate);
  const selectableVisualTemplates =
    surface === "widget"
      ? visualTemplates.filter((item) => item.versions.some((version) => version.widget !== null))
      : visualTemplates;

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (surface === "widget" && widgetDisplay === null) {
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
          surface,
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
              ...(surface === "widget" ? { widgetConfig: { position: widgetPosition } } : {}),
              dataBindings,
            };
          })(),
        }),
      });
      const json = (await response.json()) as CreatedLink & { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Création impossible");
        return;
      }
      toast.success("Lien de chat créé.");
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
            if (next === "specifique") setIdentificationMode("contact");
            if (next === "standard" && surface === "widget") setIdentificationMode("anonymous");
          }}
        >
          {CHAT_LINK_TYPES.map((value) => (
            <option key={value} value={value}>
              {value === "specifique" ? "Spécifique à un prospect" : "Standard"}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Diffusion
        <select
          value={surface}
          onChange={(event) => {
            const next = event.target.value as ChatLinkSurface;
            setSurface(next);
            if (next === "widget") {
              if (type === "standard") setIdentificationMode("anonymous");
              setConfidentialiteId("");
              if (widgetDisplayForSelection(visualTemplates, visualTemplate) === null) {
                setVisualTemplate("");
                setParams({});
                setDataBindings({});
              }
            }
          }}
        >
          {CHAT_LINK_SURFACES.map((value) => (
            <option key={value} value={value}>
              {value === "page" ? "Page publique" : "Widget intégrable"}
            </option>
          ))}
        </select>
        <span className="hint">
          {surface === "page"
            ? "Page publique /l/<jeton>."
            : "Widget flottant intégrable par copier/coller sur un site tiers."}
        </span>
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
      ) : surface === "widget" ? (
        <p className="hint">
          Identification : anonyme (obligatoire). Aucun formulaire de contact ne s&apos;affiche dans
          le widget.
        </p>
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

      {surface === "widget" ? (
        <p className="hint">
          Confidentialité : aucune politique affichée dans le widget. La responsabilité de
          l&apos;intégration sur un site tiers est portée par son exploitant.
        </p>
      ) : (
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
          <span className="hint">
            Le visiteur devra accepter cette politique avant de discuter.
          </span>
        </label>
      )}

      <label className="field">
        Template visuel
        <select
          value={visualTemplate}
          disabled={selectableVisualTemplates.length === 0}
          onChange={(event) => {
            const next = event.target.value;
            const display = widgetDisplayForSelection(visualTemplates, next);
            setVisualTemplate(next);
            setParams(defaultsForSchema(paramsSchemaForSelection(visualTemplates, next)));
            setDataBindings({});
            if (display !== null) setWidgetPosition(display.defaultPosition);
          }}
        >
          <option value="">— Défaut —</option>
          {selectableVisualTemplates.flatMap((item) =>
            item.versions
              .filter((entry) => surface !== "widget" || entry.widget !== null)
              .map((entry) => (
                <option key={`${item.id}@${entry.version}`} value={`${item.id}@${entry.version}`}>
                  {item.name} ({entry.version})
                </option>
              )),
          )}
        </select>
        <span className="hint">
          {surface === "widget" && selectableVisualTemplates.length === 0
            ? "Aucun template installé ne supporte le widget. Importez un template avec ui.widget."
            : "Personnalise l'interface publique du chat. Changer de template réinitialise ses paramètres."}
        </span>
      </label>

      {surface === "widget" && widgetDisplay !== null ? (
        <label className="field">
          Position du widget
          <select
            value={widgetPosition}
            onChange={(event) => setWidgetPosition(event.target.value as WidgetPosition)}
          >
            {WIDGET_POSITIONS.filter((position) =>
              widgetDisplay.allowedPositions.includes(position),
            ).map((position) => (
              <option key={position} value={position}>
                {position === "bottom-right"
                  ? "En bas à droite"
                  : position === "bottom-left"
                    ? "En bas à gauche"
                    : position === "top-right"
                      ? "En haut à droite"
                      : "En haut à gauche"}
              </option>
            ))}
          </select>
        </label>
      ) : null}

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
