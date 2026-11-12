"use client";

import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { ChatLinkWithUrl } from "@/application/use-cases/links/link-urls";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import type { ChatLinkSurface } from "@/domain/entities/chat";
import { channelsForLink } from "@/domain/entities/chat";
import type { TemplateParamValues } from "@/domain/template-params";
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

type DisplayDevice = "desktop" | "mobile";
type MobileTab = "preview" | "settings";

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
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const previewRef = useRef<HTMLElement>(null);
  useToastOnMessage(error);

  useEffect(() => {
    const node = previewRef.current;
    if (node === null) return;
    const update = (): void => setPreviewHeight(node.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const draft = drafts[surface];
  const paramsSchema = paramsSchemaForSelection(visualTemplates, draft.visualTemplate);
  const widgetDisplay = widgetDisplayForSelection(visualTemplates, draft.visualTemplate);
  const selectableTemplates =
    surface === "widget"
      ? visualTemplates.filter((item) => item.versions.some((version) => version.widget !== null))
      : visualTemplates;

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

  return (
    <section className="display-settings-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Chatbot</span>
          <h1 className="text-title">Paramètres d’affichage</h1>
          <p className="muted-text">
            {link.label === "" ? "Chatbot sans nom" : link.label} · configurez les canaux, le
            template et son rendu.
          </p>
        </div>
        <div className="tools">
          <a className="btn ghost small" href="/liens">
            ← Chatbots
          </a>
        </div>
      </div>

      <div className="display-settings-mobile-tabs" role="tablist" aria-label="Affichage">
        {(["preview", "settings"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={mobileTab === tab}
            className={`display-settings-mobile-tab${mobileTab === tab ? " is-active" : ""}`}
            onClick={() => setMobileTab(tab)}
          >
            {tab === "preview" ? "Aperçu" : "Paramétrages"}
          </button>
        ))}
      </div>

      <div className={`display-settings-grid display-settings-grid--${mobileTab}`}>
        <section className="display-settings-preview" ref={previewRef}>
          <div className="display-settings-toolbar">
            <div className="display-mode-switch" role="tablist" aria-label="Mode d’affichage">
              {(["page", "widget"] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  role="tab"
                  aria-selected={surface === entry}
                  className={`display-mode-button${surface === entry ? " is-active" : ""}`}
                  onClick={() => setSurface(entry)}
                >
                  {entry === "page" ? "Page" : "Widget"}
                  <span className={`badge ${drafts[entry].enabled ? "" : "muted"}`}>
                    {drafts[entry].enabled ? "actif" : "inactif"}
                  </span>
                </button>
              ))}
            </div>

            {surface === "page" ? (
              <div className="display-device-switch">
                {(["desktop", "mobile"] as const).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className={`display-device-button${device === entry ? " is-active" : ""}`}
                    onClick={() => setDevice(entry)}
                  >
                    {entry === "desktop" ? "Desktop" : "Mobile"}
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
          <p className="hint">
            {surface === "page"
              ? "Aperçu de la page publique du chatbot. Le rendu Desktop et Mobile partage le même template."
              : "Aperçu du chat dans sa surface widget. La position et le template sont ceux du canal widget."}
          </p>
        </section>

        <aside
          className="display-settings-controls"
          style={
            previewHeight === null
              ? undefined
              : ({ "--display-panel-height": `${Math.round(previewHeight)}px` } as CSSProperties)
          }
        >
          <form
            className="display-settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={!canEdit}>
              <section className="card display-settings-card">
                <h2 className="text-title">Canaux de diffusion</h2>
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

              <section className="card display-settings-card">
                <h2 className="text-title">Template — {surface === "page" ? "Page" : "Widget"}</h2>
                <label className="field">
                  Template visuel
                  <select
                    value={draft.visualTemplate}
                    disabled={selectableTemplates.length === 0}
                    onChange={(event) => changeTemplate(event.target.value)}
                  >
                    <option value="">— Défaut —</option>
                    {selectableTemplates.flatMap((item) =>
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
                    {surface === "widget" && selectableTemplates.length === 0
                      ? "Aucun template installé ne supporte le widget."
                      : "Changer de template réinitialise ses paramètres et ses sources de données."}
                  </span>
                </label>

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

                <TemplateParamsFields
                  schema={paramsSchema}
                  values={draft.params as TemplateParamValues}
                  onChange={(params) => setDraft({ params })}
                />
              </section>
            </fieldset>

            <div className="display-settings-actions">
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
