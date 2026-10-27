"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryPicker } from "@/components/categories/CategoryPicker";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import {
  ACTIVE_LINK_IDENTIFICATION_MODES,
  type ActiveLinkIdentificationMode,
  CHAT_LINK_SURFACES,
  type ChatLinkSources,
  type ChatLinkSurface,
} from "@/domain/entities/chat";
import type { TemplateParamValues } from "@/domain/template-params";
import { orphanParamKeys } from "@/domain/template-params";
import { WIDGET_POSITIONS, type WidgetPosition } from "@/domain/widget";
import { AiAssignmentField, type LinkAiValue } from "./AiAssignmentField";
import { LinkDataBindingsField } from "./LinkDataBindingsField";
import { SourcesField } from "./SourcesField";
import { TemplateParamsFields } from "./TemplateParamsFields";
import type {
  AiProviderOption,
  ChatLinkRow,
  ConfidentialiteOption,
  VisualTemplateOption,
} from "./types";
import { UserStateField } from "./UserStateField";
import {
  defaultsForSchema,
  paramsSchemaForSelection,
  parseVisualTemplateSelection,
  widgetDisplayForSelection,
} from "./visual-template-selection";

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
  const [label, setLabel] = useState(link.label);
  const [surface, setSurface] = useState<ChatLinkSurface>(link.surface);
  const [identificationMode, setIdentificationMode] = useState<ActiveLinkIdentificationMode>(
    link.identificationMode,
  );
  const [expiresAt, setExpiresAt] = useState(
    link.expiresAt === null ? "" : link.expiresAt.slice(0, 10),
  );
  const [sources, setSources] = useState<ChatLinkSources>({ ...link.sources });
  const [userStateEnabled, setUserStateEnabled] = useState<boolean>(link.userStateEnabled);
  const [confidentialiteId, setConfidentialiteId] = useState<string>(link.confidentialiteId ?? "");
  const [visualTemplate, setVisualTemplate] = useState<string>(
    link.visualTemplateId !== null
      ? `${link.visualTemplateId}@${link.visualTemplateVersion ?? ""}`
      : "",
  );
  const [params, setParams] = useState<TemplateParamValues>({ ...link.visualTemplateParams });
  const [widgetPosition, setWidgetPosition] = useState<WidgetPosition>(
    link.widgetConfig.position ?? "bottom-right",
  );
  const [dataBindings, setDataBindings] = useState<Record<string, string>>({});
  const [dataBindingsLoaded, setDataBindingsLoaded] = useState(false);
  const [ai, setAi] = useState<LinkAiValue>({
    aiProviderId: link.aiProviderId,
    aiModel: link.aiModel,
  });
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const paramsSchema = paramsSchemaForSelection(visualTemplates, visualTemplate);
  const widgetDisplay = widgetDisplayForSelection(visualTemplates, visualTemplate);
  const selectableVisualTemplates =
    surface === "widget"
      ? visualTemplates.filter((item) => item.versions.some((version) => version.widget !== null))
      : visualTemplates;
  const orphans = orphanParamKeys(paramsSchema, params);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (widgetDisplay !== null && !widgetDisplay.allowedPositions.includes(widgetPosition)) {
      setWidgetPosition(widgetDisplay.defaultPosition);
    }
  }, [widgetDisplay, widgetPosition]);

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
    if (surface === "widget" && widgetDisplay === null) {
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
          surface,
          identificationMode,
          expiresAt,
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
              ...(dataBindingsLoaded ? { dataBindings } : {}),
            };
          })(),
        }),
      });
      const json = (await response.json()) as { link?: ChatLinkRow; error?: string };
      if (!response.ok || json.link === undefined) {
        setError(json.error ?? "Modification impossible");
        return;
      }
      toast.success("Lien de chat mis à jour.");
      onSaved(json.link);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
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

            <label className="field">
              Diffusion
              <select
                value={surface}
                onChange={(event) => {
                  const next = event.target.value as ChatLinkSurface;
                  setSurface(next);
                  if (next === "widget") {
                    if (link.type === "standard") setIdentificationMode("anonymous");
                    setConfidentialiteId("");
                    if (widgetDisplayForSelection(visualTemplates, visualTemplate) === null) {
                      setVisualTemplate("");
                      setParams({});
                      setDataBindings({});
                      setDataBindingsLoaded(true);
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
            </label>

            {link.type === "standard" && surface === "widget" ? (
              <p className="hint">
                Identification : anonyme (obligatoire). Aucun formulaire de contact dans le widget.
              </p>
            ) : link.type === "standard" ? (
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
                    ? "Nom et email requis avant la discussion."
                    : "Aucun nom, email ou contact demandé."}
                </span>
              </label>
            ) : (
              <p className="hint">
                Identification : prospect lié au lien. Le mode anonyme est indisponible.
              </p>
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

            <CategoryPicker contentType="link" contentId={link.id} />

            <SourcesField value={sources} onChange={setSources} />

            <UserStateField value={userStateEnabled} onChange={setUserStateEnabled} />

            {surface === "widget" ? (
              <p className="hint">Confidentialité : aucune politique affichée dans le widget.</p>
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
                  setDataBindingsLoaded(true);
                  if (display !== null) setWidgetPosition(display.defaultPosition);
                }}
              >
                <option value="">— Défaut —</option>
                {selectableVisualTemplates.flatMap((item) =>
                  item.versions
                    .filter((entry) => surface !== "widget" || entry.widget !== null)
                    .map((entry) => (
                      <option
                        key={`${item.id}@${entry.version}`}
                        value={`${item.id}@${entry.version}`}
                      >
                        {item.name} ({entry.version})
                      </option>
                    )),
                )}
              </select>
              <span className="hint">
                {surface === "widget" && selectableVisualTemplates.length === 0
                  ? "Aucun template installé ne supporte le widget."
                  : "Changer de template réinitialise ses paramètres aux valeurs par défaut."}
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

            <TemplateParamsFields
              schema={paramsSchema}
              values={params}
              onChange={setParams}
              orphans={orphans}
              onRemoveOrphan={(key) => {
                const next = { ...params };
                delete next[key];
                setParams(next);
              }}
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
