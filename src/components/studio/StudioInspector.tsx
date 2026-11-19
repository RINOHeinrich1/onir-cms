"use client";

import { useState } from "react";
import { TemplateParamsFields } from "@/components/links/TemplateParamsFields";
import type { VisualTemplateOption } from "@/components/links/types";
import { StudioIcon, type StudioIconName } from "@/components/studio/StudioIcon";
import type { ChatLinkSurface } from "@/domain/entities/chat";
import type {
  TemplateParamSchema,
  TemplateParamValues,
} from "@/domain/template-params";
import type { WidgetDisplay, WidgetPosition } from "@/domain/widget";
import { countByTab, filterParams, selectionFor } from "./studio-utils";
import type { StudioTab } from "./types";

type Props = {
  schema: TemplateParamSchema[];
  params: TemplateParamValues;
  onChange: (values: TemplateParamValues) => void;
  template: VisualTemplateOption | null;
  selection: string;
  surface: ChatLinkSurface;
  widgetDisplay: WidgetDisplay | null;
  widgetPosition: WidgetPosition;
  onWidgetPositionChange: (position: WidgetPosition) => void;
  onSelectionChange: (selection: string) => void;
  tab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  onReset: () => void;
  onReload: () => void;
  onSave: () => void;
  saving: boolean;
  canEdit: boolean;
  canSave: boolean;
  hasLink: boolean;
};

const TABS: { id: StudioTab; label: string; icon: StudioIconName }[] = [
  { id: "all", label: "Tous", icon: "sliders" },
  { id: "content", label: "Contenu", icon: "type" },
  { id: "colors", label: "Couleurs", icon: "palette" },
  { id: "images", label: "Images", icon: "image" },
  { id: "advanced", label: "Avancé", icon: "layers" },
];

const PALETTE = [
  "#004a38",
  "#063d2e",
  "#e1eedc",
  "#f4f1e5",
  "#fffdf6",
  "#f08000",
  "#ffc46b",
  "#0f172a",
  "#334155",
  "#64748b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
];

const POSITION_LABELS: Record<WidgetPosition, string> = {
  "bottom-right": "Bas droite",
  "bottom-left": "Bas gauche",
  "top-right": "Haut droite",
  "top-left": "Haut gauche",
};

function colorValue(param: TemplateParamSchema, params: TemplateParamValues): string {
  const value = params[param.key];
  if (typeof value === "string") return value;
  return typeof param.default === "string" ? param.default : "#000000";
}

export function StudioInspector({
  schema,
  params,
  onChange,
  template,
  selection,
  surface,
  widgetDisplay,
  widgetPosition,
  onWidgetPositionChange,
  onSelectionChange,
  tab,
  onTabChange,
  onReset,
  onReload,
  onSave,
  saving,
  canEdit,
  canSave,
  hasLink,
}: Props) {
  const [search, setSearch] = useState("");

  const colorParams = schema.filter((param) => param.type === "color");
  const filtered = filterParams(schema, tab, search);
  const showPalette = colorParams.length > 0 && (tab === "all" || tab === "colors");
  const availableVersions =
    template === null
      ? []
      : surface === "widget"
        ? template.versions.filter((entry) => entry.widget !== null)
        : template.versions;

  return (
    <aside className="studio-panel studio-panel--inspector">
      <div className="studio-panel-head">
        <div>
          <p className="studio-eyebrow">Inspecteur</p>
          <h2>Personnalisation</h2>
        </div>
        {hasLink ? (
          <button
            type="button"
            className="studio-icon-button"
            title="Recharger les valeurs du chatbot"
            onClick={onReload}
          >
            <StudioIcon name="reset" />
          </button>
        ) : null}
      </div>

      {template === null ? (
        <div className="studio-empty studio-empty--panel">
          <span className="studio-empty-icon">
            <StudioIcon name="sliders" size={22} />
          </span>
          <strong>Aucun modèle sélectionné</strong>
          <p>Choisissez un template dans la bibliothèque pour afficher ses réglages.</p>
        </div>
      ) : (
        <>
          <div className="studio-template-summary">
            <div className="studio-template-summary-head">
              <div>
                <strong>{template.name}</strong>
                <small>{template.key}</small>
              </div>
              <span className={`studio-surface-badge studio-surface-badge--${surface}`}>
                {surface === "page" ? "Page" : "Widget"}
              </span>
            </div>
            {template.description === undefined || template.description === "" ? null : (
              <p className="studio-template-description">{template.description}</p>
            )}
            <label className="studio-version-select">
              <span>Version active</span>
              <span className="studio-select-wrap">
                <select
                  value={selection}
                  disabled={availableVersions.length === 0}
                  onChange={(event) => onSelectionChange(event.target.value)}
                >
                  {availableVersions.length === 0 ? (
                    <option value="">Aucune version compatible</option>
                  ) : null}
                  {availableVersions.map((entry) => (
                    <option
                      key={entry.version}
                      value={selectionFor(template.id, entry.version)}
                    >
                      {entry.version}
                      {entry.widget === null ? " · page uniquement" : ""}
                    </option>
                  ))}
                </select>
                <StudioIcon name="chevron" size={13} />
              </span>
            </label>
          </div>

          {surface === "widget" && widgetDisplay !== null ? (
            <div className="studio-position-block">
              <span className="studio-field-label">Position du widget</span>
              <div className="studio-position-grid">
                {widgetDisplay.allowedPositions.map((position) => (
                  <button
                    key={position}
                    type="button"
                    className={`studio-position-button${widgetPosition === position ? " is-active" : ""}`}
                    onClick={() => onWidgetPositionChange(position)}
                  >
                    <span className={`studio-position-preview studio-position-preview--${position}`}>
                      <i />
                    </span>
                    {POSITION_LABELS[position]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="studio-tabs" role="tablist" aria-label="Catégories de paramètres">
            {TABS.map((entry) => {
              const count = countByTab(schema, entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === entry.id}
                  className={`studio-tab${tab === entry.id ? " is-active" : ""}`}
                  onClick={() => onTabChange(entry.id)}
                >
                  <StudioIcon name={entry.icon} size={14} />
                  {entry.label}
                  <span>{count}</span>
                </button>
              );
            })}
          </div>

          <label className="studio-search studio-search--inspector">
            <StudioIcon name="search" size={15} />
            <input
              type="search"
              value={search}
              placeholder="Filtrer les réglages…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          {showPalette ? (
            <section className="studio-palette">
              <div className="studio-section-head">
                <span>Palette rapide</span>
                <small>Cliquez pour appliquer</small>
              </div>
              {colorParams.map((param) => {
                const current = colorValue(param, params);
                return (
                  <div key={param.key} className="studio-palette-row">
                    <span className="studio-palette-label" title={param.description}>
                      {param.label}
                    </span>
                    <span className="studio-swatches">
                      {PALETTE.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`studio-swatch${current.toLowerCase() === color.toLowerCase() ? " is-active" : ""}`}
                          style={{ backgroundColor: color }}
                          title={color}
                          aria-label={`${param.label} : ${color}`}
                          onClick={() => onChange({ ...params, [param.key]: color })}
                        />
                      ))}
                      <span className="studio-swatch-value">{current}</span>
                    </span>
                  </div>
                );
              })}
            </section>
          ) : null}

          <div className="studio-params">
            {filtered.length === 0 ? (
              <div className="studio-empty studio-empty--inline">
                <span className="studio-empty-icon">
                  <StudioIcon name="search" size={18} />
                </span>
                <strong>Aucun réglage</strong>
                <p>
                  {schema.length === 0
                    ? "Cette version ne déclare aucun paramètre personnalisable."
                    : "Aucun paramètre ne correspond à ce filtre."}
                </p>
              </div>
            ) : (
              <TemplateParamsFields schema={filtered} values={params} onChange={onChange} />
            )}
          </div>

          <div className="studio-inspector-footer">
            {canEdit ? (
              <>
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={schema.length === 0}
                  onClick={onReset}
                >
                  <StudioIcon name="reset" size={14} />
                  Défauts
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={!canSave}
                  onClick={onSave}
                >
                  <StudioIcon name="save" size={14} />
                  {saving ? "Enregistrement…" : "Enregistrer sur le chatbot"}
                </button>
              </>
            ) : (
              <span className="studio-readonly">
                <StudioIcon name="eye" size={14} />
                Lecture seule : permission d’édition requise.
              </span>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
