"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatLinkWithUrl } from "@/application/use-cases/links/link-urls";
import { TemplateCover } from "@/components/templates/TemplateCover";
import { confirmDialog } from "@/components/ui/confirm";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import type { ChatLinkSurface } from "@/domain/entities/chat";
import { channelsForLink } from "@/domain/entities/chat";
import type { TemplateParamValues } from "@/domain/template-params";
import { latestTemplateVersion } from "@/domain/template-version";
import { WIDGET_POSITIONS, type WidgetPosition } from "@/domain/widget";
import { type ChannelDraft, type ChannelDrafts, channelApiPayload } from "./LinkChannelsFields";
import { type ParamTab, paramsForTab, paramTabsForSchema } from "./param-tabs";
import { TemplateParamsFields } from "./TemplateParamsFields";
import type { VisualTemplateOption } from "./types";
import {
  mergeParamsForSelection,
  paramsSchemaForSelection,
  widgetDisplayForSelection,
} from "./visual-template-selection";

type DisplayDevice = "desktop" | "tablet" | "mobile";
type MobileTab = "models" | "preview" | "settings";
type ChatbotOption = { id: string; label: string; type: "standard" | "specifique" };

function StudioIcon({
  name,
  size = 16,
}: {
  name: "back" | "expand" | "external" | "monitor" | "tablet" | "smartphone";
  size?: number;
}) {
  const paths = {
    back: <path d="M19 12H5m6 6-6-6 6-6" />,
    expand: <path d="M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5" />,
    external: (
      <>
        <path d="M14 3h7v7" />
        <path d="M10 14 21 3" />
        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
      </>
    ),
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8m-4-4v4" />
      </>
    ),
    tablet: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M11 18h2" />
      </>
    ),
    smartphone: (
      <>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function previewSize(device: DisplayDevice): { width: number; label: string } {
  if (device === "tablet") return { width: 834, label: "834 × 1112" };
  if (device === "mobile") return { width: 390, label: "390 × 844" };
  return { width: 1280, label: "1280 × 800" };
}

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

export function LinkDisplaySettings({
  link,
  linkOptions,
  visualTemplates,
  canEdit,
  initialSurface,
}: {
  link: ChatLinkWithUrl;
  linkOptions: ChatbotOption[];
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
  const [zoomMode, setZoomMode] = useState<"fit" | "custom">("custom");
  const [customZoom, setCustomZoom] = useState(100);
  const [fitZoom, setFitZoom] = useState(1);
  const [chatbotId, setChatbotId] = useState(link.id);
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const [savedDrafts, setSavedDrafts] = useState(() => JSON.stringify(initialDrafts(link)));
  const dirty = JSON.stringify(drafts) !== savedDrafts;
  useToastOnMessage(error);

  useEffect(() => {
    if (window.matchMedia("(max-width: 720px)").matches) setDevice("mobile");
  }, []);

  useEffect(() => {
    const node = previewCanvasRef.current;
    if (node === null) return;
    const update = (): void => {
      const available = Math.max(240, node.clientWidth - 96);
      setFitZoom(Math.max(0.25, Math.min(1, available / previewSize(device).width)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [device]);

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
  const paramTabs = useMemo(() => paramTabsForSchema(paramsSchema), [paramsSchema]);
  const activeParamTab: ParamTab = paramTabs.some((tab) => tab.id === paramTab) ? paramTab : "all";
  const filteredParams = paramsForTab(paramsSchema, activeParamTab, paramSearch);
  const zoom = zoomMode === "fit" ? fitZoom : customZoom / 100;

  useEffect(() => {
    if (!paramTabs.some((tab) => tab.id === paramTab)) setParamTab("all");
  }, [paramTab, paramTabs]);

  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const previewTokenRef = useRef<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        try {
          const response = await fetch(
            `/api/links/${encodeURIComponent(link.id)}/preview-session`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token: previewTokenRef.current,
                surface,
                template: draft.visualTemplate === "" ? null : draft.visualTemplate,
                params: draft.params,
              }),
              signal: controller.signal,
            },
          );
          const json = (await response.json()) as { token?: string; error?: string };
          if (!response.ok || typeof json.token !== "string") {
            setPreviewError(json.error ?? "Aperçu indisponible");
            return;
          }
          previewTokenRef.current = json.token;
          setPreviewToken(json.token);
          setPreviewRevision((value) => value + 1);
          setPreviewError(null);
        } catch {
          if (!controller.signal.aborted) setPreviewError("Aperçu indisponible");
        }
      },
      previewTokenRef.current === null ? 0 : 240,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draft.params, draft.visualTemplate, link.id, surface]);

  const previewSrc = useMemo(() => {
    if (previewToken === null) return "";
    if (surface === "widget") {
      const token = widgetToken(link.url);
      if (token !== null) {
        const query = new URLSearchParams({
          preview: previewToken,
          position: draft.widgetPosition,
          v: String(previewRevision),
        });
        return `/embed/${encodeURIComponent(token)}/preview?${query.toString()}`;
      }
    }
    const query = new URLSearchParams({
      embed: "1",
      surface,
      preview: previewToken,
      v: String(previewRevision),
    });
    return `/liens/${link.id}/apercu?${query.toString()}`;
  }, [draft.widgetPosition, link.id, link.url, previewRevision, previewToken, surface]);

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

  const changeChatbot = async (nextId: string): Promise<void> => {
    if (nextId === link.id) return;
    if (dirty) {
      const accepted = await confirmDialog(
        "Des modifications ne sont pas enregistrées. Changer de chatbot les perdra. Continuer ?",
      );
      if (!accepted) {
        setChatbotId(link.id);
        return;
      }
    }
    setChatbotId(nextId);
    router.push(`/liens/${nextId}/apercu?surface=${surface}`);
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
      setSavedDrafts(JSON.stringify(drafts));
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
          <a className="display-studio-icon-button" href="/liens" aria-label="Retour aux chatbots">
            <StudioIcon name="back" />
          </a>
          <div className="display-studio-title">
            <strong>Paramètres d’affichage</strong>
            <small>Personnalisation en direct</small>
          </div>
          <label className="display-studio-chatbot">
            <span>Chatbot</span>
            <select value={chatbotId} onChange={(event) => void changeChatbot(event.target.value)}>
              {linkOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} · {entry.type === "standard" ? "standard" : "spécifique"}
                </option>
              ))}
            </select>
          </label>
        </div>
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
        <div className="display-studio-header-actions">
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
              const latest = latestTemplateVersion(
                versions.filter((entry) => !entry.disabled && entry.healthStatus !== "error"),
              );
              const isSelected = selected.id === template.id;
              const selectedVersion =
                isSelected && selected.version !== null
                  ? (versions.find((entry) => entry.version === selected.version) ?? latest)
                  : latest;
              const currentVersion = isSelected ? selected.version : null;
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
                      {isSelected ? <span className="display-studio-check">✓</span> : null}
                    </span>
                    <span className="display-studio-template-name">
                      <strong>{template.name}</strong>
                      <small>{template.key}</small>
                    </span>
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
                      {versions.map((entry) => {
                        const unavailable = entry.disabled || entry.healthStatus === "error";
                        return (
                          <option
                            key={entry.version}
                            value={`${template.id}@${entry.version}`}
                            disabled={unavailable && entry.version !== currentVersion}
                          >
                            {entry.version}
                            {entry.widget === null ? " · page" : ""}
                            {entry.disabled
                              ? " · désactivée"
                              : entry.healthStatus === "error"
                                ? " · en erreur"
                                : ""}
                          </option>
                        );
                      })}
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
                    title={
                      entry === "desktop" ? "Bureau" : entry === "tablet" ? "Tablette" : "Mobile"
                    }
                    aria-label={
                      entry === "desktop" ? "Bureau" : entry === "tablet" ? "Tablette" : "Mobile"
                    }
                    onClick={() => setDevice(entry)}
                  >
                    <StudioIcon
                      name={
                        entry === "desktop"
                          ? "monitor"
                          : entry === "tablet"
                            ? "tablet"
                            : "smartphone"
                      }
                      size={15}
                    />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="display-studio-preview-tools">
              <label className="display-studio-zoom">
                <span>Zoom</span>
                <select
                  value={zoomMode === "fit" ? "fit" : String(customZoom)}
                  onChange={(event) => {
                    if (event.target.value === "fit") {
                      setZoomMode("fit");
                      return;
                    }
                    setCustomZoom(Number(event.target.value));
                    setZoomMode("custom");
                  }}
                >
                  <option value="fit">Ajuster · {Math.round(fitZoom * 100)}%</option>
                  {[50, 75, 100, 125, 150].map((value) => (
                    <option key={value} value={value}>
                      {value}%
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="display-studio-icon-button"
                title="Plein écran"
                aria-label="Plein écran"
                onClick={() => {
                  const node = previewCanvasRef.current;
                  if (node === null) return;
                  if (document.fullscreenElement !== null) void document.exitFullscreen();
                  else void node.requestFullscreen?.();
                }}
              >
                <StudioIcon name="expand" />
              </button>
              <a
                className="display-studio-icon-button"
                href={previewSrc === "" ? "#" : previewSrc}
                target="_blank"
                rel="noreferrer"
                title="Ouvrir l’aperçu dans un nouvel onglet"
                aria-label="Ouvrir l’aperçu dans un nouvel onglet"
              >
                <StudioIcon name="external" />
              </a>
            </div>
          </div>
          <div
            ref={previewCanvasRef}
            className={`display-preview-canvas display-preview-canvas--${surface} display-preview-canvas--${device}`}
            data-widget-position={surface === "widget" ? draft.widgetPosition : undefined}
          >
            <div className="display-preview-zoom" style={{ transform: `scale(${zoom})` }}>
              <div className="display-preview-device">
                <div className="display-preview-chrome" aria-hidden="true">
                  <span className="display-preview-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="display-preview-address">
                    {surface === "page" ? "aperçu du template" : "site hôte · widget"}
                  </span>
                  <span className="display-preview-size">
                    {device === "desktop"
                      ? "1280 × 800"
                      : device === "tablet"
                        ? "834 × 1112"
                        : "390 × 844"}
                  </span>
                </div>
                <div className="display-preview-viewport">
                  {previewSrc === "" ? (
                    <p className="hint">Préparation de l’aperçu…</p>
                  ) : (
                    <iframe
                      key={`${surface}-${device}`}
                      title={`Aperçu ${surface === "page" ? "page" : "widget"}`}
                      src={previewSrc}
                    />
                  )}
                  {previewError === null ? null : <p className="alert error">{previewError}</p>}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="display-studio-panel display-studio-inspector">
          <div className="display-studio-panel-head">
            <div>
              <span className="eyebrow">Inspecteur</span>
              <h2>Réglages</h2>
            </div>
          </div>

          <form
            className="display-studio-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={!canEdit}>
              <section className="display-studio-summary">
                <div className="display-studio-summary-head">
                  <div>
                    <strong>{selectedTemplate?.name ?? "Template par défaut"}</strong>
                    <small>{selectedTemplate?.key ?? "interface ONIR-CMS"}</small>
                  </div>
                  <div className="display-studio-summary-actions">
                    {selectedTemplate !== null ? (
                      <a
                        className="display-studio-template-link"
                        href={`/templates-visuels/${selectedTemplate.id}`}
                        title="Voir la page du template"
                        aria-label="Voir la page du template"
                      >
                        <StudioIcon name="external" size={14} />
                      </a>
                    ) : null}
                    <span
                      className={`display-studio-surface-badge display-studio-surface-badge--${surface}`}
                    >
                      {surface === "page" ? "Page" : "Widget"}
                    </span>
                  </div>
                </div>
                {selectedTemplate?.description ? (
                  <p className="display-studio-summary-description">
                    {selectedTemplate.description}
                  </p>
                ) : null}
                {selectedTemplate !== null ? (
                  <label className="display-studio-version display-studio-version--inspector">
                    <span>Version active</span>
                    <select
                      value={draft.visualTemplate}
                      onChange={(event) => changeTemplate(event.target.value)}
                    >
                      {templateVersions(selectedTemplate, surface).map((entry) => {
                        const unavailable = entry.disabled || entry.healthStatus === "error";
                        return (
                          <option
                            key={entry.version}
                            value={`${selectedTemplate.id}@${entry.version}`}
                            disabled={unavailable && entry.version !== selected.version}
                          >
                            {entry.version}
                            {entry.widget === null ? " · page" : ""}
                            {entry.disabled
                              ? " · désactivée"
                              : entry.healthStatus === "error"
                                ? " · en erreur"
                                : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                ) : null}
                {surface === "widget" && widgetDisplay !== null ? (
                  <div className="display-studio-position">
                    <span className="display-studio-position-label">Position du widget</span>
                    <div className="display-studio-position-grid">
                      {WIDGET_POSITIONS.filter((position) =>
                        widgetDisplay.allowedPositions.includes(position),
                      ).map((position) => (
                        <button
                          key={position}
                          type="button"
                          className={`display-studio-position-button${draft.widgetPosition === position ? " is-active" : ""}`}
                          onClick={() => setDraft({ widgetPosition: position as WidgetPosition })}
                        >
                          {position === "bottom-right"
                            ? "Bas droite"
                            : position === "bottom-left"
                              ? "Bas gauche"
                              : position === "top-right"
                                ? "Haut droite"
                                : "Haut gauche"}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

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
                <div className="display-studio-params-head">
                  <h3>Paramètres</h3>
                  <span className="badge muted">{filteredParams.length}</span>
                </div>
                {paramTabs.length === 0 ? null : (
                  <div className="display-studio-param-tabs">
                    {paramTabs.map((tab) => {
                      const count = paramsForTab(paramsSchema, tab.id, "").length;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          className={`display-studio-param-tab${activeParamTab === tab.id ? " is-active" : ""}`}
                          title={
                            tab.id === "advanced"
                              ? "Nombres, booléens, objets et listes"
                              : undefined
                          }
                          onClick={() => setParamTab(tab.id)}
                        >
                          {tab.label} <span>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
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
