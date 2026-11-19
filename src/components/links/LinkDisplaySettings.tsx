"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ChatLinkWithUrl } from "@/application/use-cases/links/link-urls";
import { TemplateCover } from "@/components/templates/TemplateCover";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import type { ChatLinkSurface } from "@/domain/entities/chat";
import { channelsForLink } from "@/domain/entities/chat";
import type { TemplateParamSchema, TemplateParamValues } from "@/domain/template-params";
import { latestTemplateVersion } from "@/domain/template-version";
import { WIDGET_POSITIONS, type WidgetPosition } from "@/domain/widget";
import { type ChannelDraft, type ChannelDrafts, channelApiPayload } from "./LinkChannelsFields";
import { TemplateParamsFields } from "./TemplateParamsFields";
import type { VisualTemplateOption } from "./types";
import {
  encodeParamsOverride,
  mergeParamsForSelection,
  paramsSchemaForSelection,
  widgetDisplayForSelection,
} from "./visual-template-selection";

type DisplayDevice = "desktop" | "tablet" | "mobile";
type MobileTab = "models" | "preview" | "settings";
type ParamTab = "all" | "content" | "colors" | "images" | "advanced";

const PARAM_TABS: Array<{ id: ParamTab; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "content", label: "Contenu" },
  { id: "colors", label: "Couleurs" },
  { id: "images", label: "Images" },
  { id: "advanced", label: "Avancé" },
];

function channelDraft(channel: ReturnType<typeof channelsForLink>[ChatLinkSurface]): ChannelDraft {
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

function initialDrafts(link: ChatLinkWithUrl): ChannelDrafts {
  const channels = channelsForLink(link);
  return {
    page: channelDraft(channels.page),
    widget: channelDraft(channels.widget),
  };
}

function widgetToken(url: string | null): string | null {
  if (url === null) return null;
  const match = /\/l\/([^/?#]+)/.exec(url);
  return match?.[1] ?? null;
}

function splitSelection(selection: string): { id: string | null; version: string | null } {
  const at = selection.lastIndexOf("@");
  if (at <= 0 || at === selection.length - 1) return { id: null, version: null };
  return { id: selection.slice(0, at), version: selection.slice(at + 1) };
}

function templateVersions(
  template: VisualTemplateOption,
  surface: ChatLinkSurface,
): VisualTemplateOption["versions"] {
  return surface === "widget"
    ? template.versions.filter((entry) => entry.widget !== null)
    : template.versions;
}

function paramsForTab(
  schema: TemplateParamSchema[],
  tab: ParamTab,
  search: string,
): TemplateParamSchema[] {
  const byTab = schema.filter((param) => {
    switch (tab) {
      case "content":
        return ["string", "text", "url", "select"].includes(param.type);
      case "colors":
        return param.type === "color";
      case "images":
        return param.type === "image";
      case "advanced":
        return ["number", "boolean", "object", "array"].includes(param.type);
      default:
        return true;
    }
  });
  const needle = search.trim().toLocaleLowerCase("fr");
  if (needle === "") return byTab;
  return byTab.filter((param) =>
    [param.key, param.label, param.description].join(" ").toLocaleLowerCase("fr").includes(needle),
  );
}

export function LinkDisplaySettings({
  link,
  visualTemplates,
  canEdit,
  initialSurface,
}: {
  link: ChatLinkWithUrl;
  visualTemplates: VisualTemplateOption[];
  canEdit: boolean;
  initialSurface: ChatLinkSurface;
}) {
  const router = useRouter();
  const toast = useToast();
  const [drafts, setDrafts] = useState<ChannelDrafts>(() => initialDrafts(link));
  const [surface, setSurface] = useState<ChatLinkSurface>(initialSurface);
  const [device, setDevice] = useState<DisplayDevice>("desktop");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("preview");
  const [gallerySearch, setGallerySearch] = useState("");
  const [paramTab, setParamTab] = useState<ParamTab>("all");
  const [paramSearch, setParamSearch] = useState("");
  useToastOnMessage(error);

  useEffect(() => {
    if (window.matchMedia("(max-width: 720px)").matches) setDevice("mobile");
  }, []);

  const draft = drafts[surface];
  const paramsSchema = paramsSchemaForSelection(visualTemplates, draft.visualTemplate);
  const widgetDisplay = widgetDisplayForSelection(visualTemplates, draft.visualTemplate);
  const selectableTemplates =
    surface === "widget"
      ? visualTemplates.filter((item) => item.versions.some((version) => version.widget !== null))
      : visualTemplates;
  const visibleTemplates = selectableTemplates.filter((template) => {
    const needle = gallerySearch.trim().toLocaleLowerCase("fr");
    return (
      needle === "" ||
      [template.name, template.key].join(" ").toLocaleLowerCase("fr").includes(needle)
    );
  });
  const selected = splitSelection(draft.visualTemplate);
  const selectedTemplate = visualTemplates.find((template) => template.id === selected.id) ?? null;
  const filteredParams = paramsForTab(paramsSchema, paramTab, paramSearch);

  const previewSrc = useMemo(() => {
    const params = encodeParamsOverride(draft.params);
    const template = draft.visualTemplate === "" ? "" : draft.visualTemplate;
    if (surface === "widget") {
      const token = widgetToken(link.url);
      if (token !== null) {
        const query = new URLSearchParams();
        if (template !== "") query.set("template", template);
        if (params !== "") query.set("params", params);
        query.set("position", draft.widgetPosition);
        const suffix = query.toString();
        return `/embed/${encodeURIComponent(token)}/preview${suffix === "" ? "" : `?${suffix}`}`;
      }
    }
    return `/liens/${link.id}/apercu?embed=1&surface=${surface}&template=${encodeURIComponent(template)}&params=${params}`;
  }, [draft.params, draft.visualTemplate, draft.widgetPosition, link.id, link.url, surface]);
  const [debouncedPreviewSrc, setDebouncedPreviewSrc] = useState(previewSrc);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedPreviewSrc(previewSrc), 220);
    return () => window.clearTimeout(timer);
  }, [previewSrc]);

  const setDraft = (patch: Partial<ChannelDraft>): void => {
    setDrafts((current) => ({
      ...current,
      [surface]: { ...current[surface], ...patch },
    }));
  };

  const toggleChannel = (channel: ChatLinkSurface, enabled: boolean): void => {
    setDrafts((current) => ({
      ...current,
      [channel]: { ...current[channel], enabled },
    }));
  };

  const changeTemplate = (next: string): void => {
    const display = widgetDisplayForSelection(visualTemplates, next);
    setDraft({
      visualTemplate: next,
      params: mergeParamsForSelection(visualTemplates, draft.visualTemplate, next, draft.params),
      ...(display === null ? {} : { widgetPosition: display.defaultPosition }),
    });
  };

  const save = async (): Promise<void> => {
    if (!canEdit || saving) return;
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels: {
            page: channelApiPayload(drafts.page),
            widget: channelApiPayload(drafts.widget),
          },
        }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      toast.success("Paramètres d’affichage enregistrés.");
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setSaving(false);
    }
  };

  const changeSurface = (next: ChatLinkSurface): void => {
    setSurface(next);
    setMobileTab("preview");
    setParamTab("all");
  };

  return (
    <section className="display-studio">
      <header className="display-studio-header">
        <div className="display-studio-heading">
          <a className="btn ghost small" href="/liens">
            ← Chatbots
          </a>
          <div>
            <span className="eyebrow">Affichage</span>
            <h1 className="text-title">Paramètres d’affichage</h1>
            <p className="hint">{link.label}</p>
          </div>
        </div>
        <div className="display-studio-header-actions">
          <div className="display-mode-switch" role="tablist" aria-label="Mode d’affichage">
            {(["page", "widget"] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={surface === entry}
                className={`display-mode-button${surface === entry ? " is-active" : ""}`}
                onClick={() => changeSurface(entry)}
              >
                {entry === "page" ? "Page" : "Widget"}
                <span className={`badge ${drafts[entry].enabled ? "" : "muted"}`}>
                  {drafts[entry].enabled ? "actif" : "inactif"}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn small"
            disabled={!canEdit || saving}
            onClick={() => void save()}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </header>

      <div className="display-studio-mobile-tabs" role="tablist" aria-label="Panneaux d’affichage">
        {(["models", "preview", "settings"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mobileTab === tab}
            className={`display-studio-mobile-tab${mobileTab === tab ? " is-active" : ""}`}
            onClick={() => setMobileTab(tab)}
          >
            {tab === "models" ? "Modèles" : tab === "preview" ? "Aperçu" : "Réglages"}
          </button>
        ))}
      </div>

      <div className="display-studio-grid" data-mobile-panel={mobileTab}>
        <aside className="display-studio-panel display-studio-gallery">
          <div className="display-studio-panel-head">
            <div>
              <span className="eyebrow">Bibliothèque</span>
              <h2>Modèles</h2>
            </div>
            <span className="display-studio-count">{visibleTemplates.length}</span>
          </div>
          <label className="display-studio-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={gallerySearch}
              placeholder="Rechercher un modèle…"
              onChange={(event) => setGallerySearch(event.target.value)}
            />
          </label>

          <button
            type="button"
            className={`display-studio-default${draft.visualTemplate === "" ? " is-selected" : ""}`}
            onClick={() => changeTemplate("")}
          >
            <span className="display-studio-default-icon" aria-hidden="true">
              ◌
            </span>
            <span>
              <strong>Template par défaut</strong>
              <small>Interface ONIR-CMS</small>
            </span>
            {draft.visualTemplate === "" ? <span className="display-studio-check">✓</span> : null}
          </button>

          <div className="display-studio-template-list">
            {visibleTemplates.length === 0 ? (
              <p className="hint">
                {selectableTemplates.length === 0
                  ? "Aucun template compatible avec cette surface."
                  : "Aucun modèle ne correspond à cette recherche."}
              </p>
            ) : null}
            {visibleTemplates.map((template) => {
              const versions = templateVersions(template, surface);
              const latest = latestTemplateVersion(versions);
              const isSelected = selected.id === template.id;
              const selectedVersion =
                isSelected && selected.version !== null
                  ? (versions.find((entry) => entry.version === selected.version) ?? latest)
                  : latest;
              return (
                <article
                  key={template.id}
                  className={`display-studio-template${isSelected ? " is-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="display-studio-template-main"
                    onClick={() => {
                      if (selectedVersion === null) return;
                      changeTemplate(`${template.id}@${selectedVersion.version}`);
                    }}
                  >
                    <span className="display-studio-cover">
                      <TemplateCover
                        templateId={template.id}
                        version={selectedVersion?.version ?? null}
                        name={template.name}
                      />
                    </span>
                    <span className="display-studio-template-name">
                      <strong>{template.name}</strong>
                      <small>{template.key}</small>
                    </span>
                    {isSelected ? <span className="display-studio-check">✓</span> : null}
                  </button>
                  <label className="display-studio-version">
                    <span>Version</span>
                    <select
                      value={
                        isSelected && selected.version !== null
                          ? draft.visualTemplate
                          : selectedVersion === null
                            ? ""
                            : `${template.id}@${selectedVersion.version}`
                      }
                      onChange={(event) => changeTemplate(event.target.value)}
                    >
                      {versions.length === 0 ? <option value="">Aucune</option> : null}
                      {versions.map((entry) => (
                        <option key={entry.version} value={`${template.id}@${entry.version}`}>
                          {entry.version}
                          {entry.widget === null ? " · page" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              );
            })}
          </div>
        </aside>

        <section className="display-studio-preview">
          <div className="display-studio-toolbar">
            <span className="display-studio-surface-dot" data-surface={surface} />
            <strong>{surface === "page" ? "Aperçu page" : "Aperçu widget"}</strong>
            {surface === "page" ? (
              <div className="display-device-switch" role="tablist" aria-label="Taille de l’aperçu">
                {(["desktop", "tablet", "mobile"] as const).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    role="tab"
                    aria-selected={device === entry}
                    className={`display-device-button${device === entry ? " is-active" : ""}`}
                    onClick={() => setDevice(entry)}
                  >
                    {entry === "desktop" ? "Bureau" : entry === "tablet" ? "Tablette" : "Mobile"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div
            className={`display-preview-stage display-preview-stage--${surface} display-preview-stage--${device}`}
            data-widget-position={surface === "widget" ? draft.widgetPosition : undefined}
          >
            <iframe
              key={`${surface}-${device}`}
              title={`Aperçu ${surface === "page" ? "page" : "widget"}`}
              src={debouncedPreviewSrc}
            />
          </div>
        </section>

        <aside className="display-studio-panel display-studio-inspector">
          <div className="display-studio-panel-head">
            <div>
              <span className="eyebrow">Inspecteur</span>
              <h2>Réglages</h2>
            </div>
            <a className="btn ghost small" href={`/liens/${link.id}/apercu?surface=${surface}`}>
              Aperçu seul
            </a>
          </div>

          <form
            className="display-studio-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={!canEdit}>
              <section className="display-studio-group">
                <h3>Canaux de diffusion</h3>
                <div className="display-channel-switches">
                  {(["page", "widget"] as const).map((channel) => (
                    <label key={channel} className="display-channel-toggle">
                      <input
                        type="checkbox"
                        checked={drafts[channel].enabled}
                        onChange={(event) => toggleChannel(channel, event.target.checked)}
                      />
                      <span>{channel === "page" ? "Page" : "Widget"}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="display-studio-group">
                <h3>Template — {surface === "page" ? "Page" : "Widget"}</h3>
                <p className="hint">
                  {selectedTemplate === null
                    ? "Template par défaut"
                    : `${selectedTemplate.name} · ${selectedTemplate.key}`}
                </p>
                {surface === "widget" && widgetDisplay !== null ? (
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
              </section>

              <section className="display-studio-group">
                <div className="display-studio-params-head">
                  <h3>Paramètres</h3>
                  <span className="badge muted">{filteredParams.length}</span>
                </div>
                <div className="display-studio-param-tabs">
                  {PARAM_TABS.map((tab) => {
                    const count = paramsForTab(paramsSchema, tab.id, "").length;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        className={`display-studio-param-tab${paramTab === tab.id ? " is-active" : ""}`}
                        onClick={() => setParamTab(tab.id)}
                      >
                        {tab.label} <span>{count}</span>
                      </button>
                    );
                  })}
                </div>
                <label className="display-studio-search display-studio-search--params">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={paramSearch}
                    placeholder="Filtrer les paramètres…"
                    onChange={(event) => setParamSearch(event.target.value)}
                  />
                </label>
                {filteredParams.length === 0 ? (
                  <p className="hint">
                    {paramsSchema.length === 0
                      ? "Cette version ne déclare aucun paramètre personnalisable."
                      : "Aucun paramètre ne correspond à ce filtre."}
                  </p>
                ) : (
                  <TemplateParamsFields
                    schema={filteredParams}
                    values={draft.params as TemplateParamValues}
                    onChange={(params) => setDraft({ params })}
                  />
                )}
              </section>
            </fieldset>

            <div className="display-studio-actions">
              {canEdit ? (
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? "Enregistrement…" : "Enregistrer les paramètres"}
                </button>
              ) : (
                <p className="hint">
                  Vous pouvez prévisualiser ce chatbot. La modification est réservée aux personnes
                  autorisées.
                </p>
              )}
            </div>
          </form>
        </aside>
      </div>
    </section>
  );
}
