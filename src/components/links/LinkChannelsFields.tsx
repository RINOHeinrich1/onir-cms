"use client";

import type {
  ActiveLinkIdentificationMode,
  ChatLinkSurface,
  ChatLinkType,
} from "@/domain/entities/chat";
import type { TemplateParamValues } from "@/domain/template-params";
import { WIDGET_POSITIONS, type WidgetPosition } from "@/domain/widget";
import { TemplateParamsFields } from "./TemplateParamsFields";
import type { ConfidentialiteOption, VisualTemplateOption } from "./types";
import {
  defaultsForSchema,
  paramsSchemaForSelection,
  parseVisualTemplateSelection,
  widgetDisplayForSelection,
} from "./visual-template-selection";

export type ChannelDraft = {
  enabled: boolean;
  identificationMode: ActiveLinkIdentificationMode;
  confidentialiteId: string;
  visualTemplate: string;
  params: TemplateParamValues;
  widgetPosition: WidgetPosition;
};

export type ChannelDrafts = Record<ChatLinkSurface, ChannelDraft>;

type Props = {
  value: ChannelDrafts;
  onChange: (next: ChannelDrafts) => void;
  active: ChatLinkSurface;
  onActiveChange: (channel: ChatLinkSurface) => void;
  type: ChatLinkType;
  visualTemplates: VisualTemplateOption[];
  confidentialites: ConfidentialiteOption[];
};

const LABELS: Record<ChatLinkSurface, string> = {
  page: "Page publique",
  widget: "Widget intégrable",
};

/** Édition des deux canaux de diffusion, avec une configuration indépendante. */
export function LinkChannelsFields({
  value,
  onChange,
  active,
  onActiveChange,
  type,
  visualTemplates,
  confidentialites,
}: Props) {
  const draft = value[active];
  const paramsSchema = paramsSchemaForSelection(visualTemplates, draft.visualTemplate);
  const widgetDisplay = widgetDisplayForSelection(visualTemplates, draft.visualTemplate);
  const selectableTemplates =
    active === "widget"
      ? visualTemplates.filter((item) => item.versions.some((version) => version.widget !== null))
      : visualTemplates;

  const setDraft = (patch: Partial<ChannelDraft>): void => {
    onChange({ ...value, [active]: { ...draft, ...patch } });
  };

  const toggle = (channel: ChatLinkSurface, enabled: boolean): void => {
    const nextDraft: ChannelDraft = {
      ...value[channel],
      enabled,
      ...(channel === "widget" && type === "standard"
        ? { identificationMode: "anonymous" as const }
        : {}),
    };
    onChange({ ...value, [channel]: nextDraft });
    if (enabled) onActiveChange(channel);
    else if (active === channel) {
      const other = channel === "page" ? "widget" : "page";
      if (value[other].enabled) onActiveChange(other);
    }
  };

  return (
    <fieldset className="field">
      <legend>Canaux de diffusion</legend>
      <p className="hint" style={{ marginTop: 0 }}>
        Activez les canaux à diffuser. Chaque canal garde sa propre configuration.
      </p>

      <div className="channel-toggles">
        {(["page", "widget"] as const).map((channel) => (
          <label key={channel} className="check channel-toggle">
            <input
              type="checkbox"
              checked={value[channel].enabled}
              onChange={(event) => toggle(channel, event.target.checked)}
            />
            <span>
              <strong>{LABELS[channel]}</strong>
              <small>
                {channel === "page"
                  ? "URL publique /l/<jeton>"
                  : "Snippet à intégrer sur un site tiers"}
              </small>
            </span>
          </label>
        ))}
      </div>

      <div className="channel-tabs" role="tablist" aria-label="Configuration du canal">
        {(["page", "widget"] as const).map((channel) => (
          <button
            key={channel}
            type="button"
            role="tab"
            aria-selected={active === channel}
            className={`channel-tab${active === channel ? " active" : ""}`}
            disabled={!value[channel].enabled}
            onClick={() => onActiveChange(channel)}
          >
            {LABELS[channel]}
            {value[channel].enabled ? null : " (désactivé)"}
          </button>
        ))}
      </div>

      {draft.enabled ? (
        <div className="channel-config">
          {type === "specifique" ? (
            <p className="hint">
              Identification : prospect lié au lien. Aucun formulaire de contact.
            </p>
          ) : active === "widget" ? (
            <p className="hint">
              Identification : anonyme. Aucun formulaire de contact dans le widget.
            </p>
          ) : (
            <label className="field">
              Identification
              <select
                value={draft.identificationMode}
                onChange={(event) =>
                  setDraft({
                    identificationMode: event.target.value as ActiveLinkIdentificationMode,
                  })
                }
              >
                <option value="contact">Nom et contact</option>
                <option value="anonymous">Anonyme</option>
              </select>
            </label>
          )}

          {active === "widget" ? (
            <p className="hint">
              Confidentialité : aucune politique affichée. L’intégrateur du widget assume la
              responsabilité de l’intégration.
            </p>
          ) : (
            <label className="field">
              Confidentialité
              <select
                value={draft.confidentialiteId}
                onChange={(event) => setDraft({ confidentialiteId: event.target.value })}
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
              value={draft.visualTemplate}
              disabled={selectableTemplates.length === 0}
              onChange={(event) => {
                const next = event.target.value;
                const display = widgetDisplayForSelection(visualTemplates, next);
                setDraft({
                  visualTemplate: next,
                  params: defaultsForSchema(paramsSchemaForSelection(visualTemplates, next)),
                  ...(display === null ? {} : { widgetPosition: display.defaultPosition }),
                });
              }}
            >
              <option value="">— Défaut —</option>
              {selectableTemplates.flatMap((item) =>
                item.versions
                  .filter((entry) => active !== "widget" || entry.widget !== null)
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
              {active === "widget" && selectableTemplates.length === 0
                ? "Aucun template installé ne supporte le widget."
                : "Changer de template réinitialise ses paramètres aux valeurs par défaut."}
            </span>
          </label>

          {active === "widget" && widgetDisplay !== null ? (
            <label className="field">
              Position du widget
              <select
                value={draft.widgetPosition}
                onChange={(event) =>
                  setDraft({ widgetPosition: event.target.value as WidgetPosition })
                }
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

          <TemplateParamsFields
            schema={paramsSchema}
            values={draft.params}
            onChange={(params) => setDraft({ params })}
          />
        </div>
      ) : (
        <p className="hint">Active ce canal pour configurer sa diffusion.</p>
      )}

      {active === "widget" ? (
        <p className="hint">
          Template compatible requis, position bornée par le template. Le snippet ne contient que le
          jeton et la position.
        </p>
      ) : null}
    </fieldset>
  );
}

/** Convertit un template visuel sélectionné en champs API. */
export function channelApiPayload(draft: ChannelDraft): {
  enabled: boolean;
  identificationMode: ActiveLinkIdentificationMode;
  confidentialiteId: string | null;
  visualTemplateId: string | null;
  visualTemplateVersion: string | null;
  visualTemplateParams: TemplateParamValues;
  widgetConfig: { position: WidgetPosition };
} {
  const template = parseVisualTemplateSelection(draft.visualTemplate);
  return {
    enabled: draft.enabled,
    identificationMode: draft.identificationMode,
    confidentialiteId: draft.confidentialiteId === "" ? null : draft.confidentialiteId,
    visualTemplateId: template.id,
    visualTemplateVersion: template.version,
    visualTemplateParams: draft.params,
    widgetConfig: { position: draft.widgetPosition },
  };
}
