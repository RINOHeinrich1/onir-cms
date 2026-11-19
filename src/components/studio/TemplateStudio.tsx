"use client";

import { useEffect, useMemo, useState } from "react";
import { type ChannelDraft, channelApiPayload } from "@/components/links/LinkChannelsFields";
import type { VisualTemplateOption } from "@/components/links/types";
import {
  defaultsForSchema,
  mergeParamsForSelection,
  paramsSchemaForSelection,
  widgetDisplayForSelection,
} from "@/components/links/visual-template-selection";
import { useToast } from "@/components/ui/ToastProvider";
import type { ChatLinkSurface } from "@/domain/entities/chat";
import type { TemplateParamValues } from "@/domain/template-params";
import type { WidgetPosition } from "@/domain/widget";
import { StudioGallery } from "./StudioGallery";
import { StudioIcon } from "./StudioIcon";
import { StudioInspector } from "./StudioInspector";
import { StudioPreview } from "./StudioPreview";
import {
  buildPreviewSrc,
  firstSelectableSelection,
  resolvedParams,
  selectedTemplate,
  selectedVersion,
  widgetDisplayFor,
} from "./studio-utils";
import type { StudioDevice, StudioLink, StudioTab } from "./types";

type Props = {
  links: StudioLink[];
  templates: VisualTemplateOption[];
  canEdit: boolean;
  initialLinkId: string | null;
};

type MobilePanel = "gallery" | "preview" | "inspector";

function initialState(
  link: StudioLink | null,
  templates: VisualTemplateOption[],
): {
  surface: ChatLinkSurface;
  selection: string;
  params: TemplateParamValues;
  widgetPosition: WidgetPosition;
} {
  if (link === null) {
    const selection = firstSelectableSelection(templates, "page");
    return {
      surface: "page",
      selection,
      params: resolvedParams(paramsSchemaForSelection(templates, selection), {}),
      widgetPosition: "bottom-right",
    };
  }
  const surface = link.activeSurface;
  const channel = link[surface];
  const stored = channel.visualTemplate;
  const selection =
    stored !== "" && selectedVersion(templates, stored) !== null
      ? stored
      : firstSelectableSelection(templates, surface);
  return {
    surface,
    selection,
    params:
      selection === ""
        ? {}
        : resolvedParams(
            paramsSchemaForSelection(templates, selection),
            stored === selection ? channel.params : {},
          ),
    widgetPosition:
      link.widget.widgetPosition ??
      widgetDisplayForSelection(templates, selection)?.defaultPosition ??
      "bottom-right",
  };
}

export function TemplateStudio({ links, templates, canEdit, initialLinkId }: Props) {
  const toast = useToast();
  const initialLink = links.find((link) => link.id === initialLinkId) ?? links[0] ?? null;
  const initial = initialState(initialLink, templates);

  const [linkState, setLinkState] = useState<StudioLink[]>(links);
  const [linkId, setLinkId] = useState(initialLink?.id ?? "");
  const [surface, setSurface] = useState<ChatLinkSurface>(initial.surface);
  const [selection, setSelection] = useState(initial.selection);
  const [params, setParams] = useState<TemplateParamValues>(initial.params);
  const [widgetPosition, setWidgetPosition] = useState<WidgetPosition>(initial.widgetPosition);
  const [device, setDevice] = useState<StudioDevice>("desktop");
  const [tab, setTab] = useState<StudioTab>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("preview");
  const [gallerySearch, setGallerySearch] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches) {
      setDevice("mobile");
    }
  }, []);

  const link = linkState.find((entry) => entry.id === linkId) ?? null;
  const schema = useMemo(
    () => paramsSchemaForSelection(templates, selection),
    [templates, selection],
  );
  const template = selectedTemplate(templates, selection);
  const version = selectedVersion(templates, selection);
  const widgetDisplay = widgetDisplayFor(templates, selection);
  const widgetCompatible = widgetDisplay !== null;

  const previewSrc = useMemo(
    () =>
      link === null
        ? ""
        : buildPreviewSrc({
            link,
            surface,
            selection,
            params,
            widgetPosition,
            refreshKey,
          }),
    [link, surface, selection, params, widgetPosition, refreshKey],
  );

  const [debouncedPreviewSrc, setDebouncedPreviewSrc] = useState(previewSrc);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedPreviewSrc(previewSrc), 220);
    return () => window.clearTimeout(timer);
  }, [previewSrc]);

  useEffect(() => {
    if (surface === "widget" && selection !== "" && !widgetCompatible) {
      const next = firstSelectableSelection(templates, "widget");
      if (next !== selection) {
        setSelection(next);
        setParams(resolvedParams(paramsSchemaForSelection(templates, next), params));
      }
    }
  }, [params, selection, surface, templates, widgetCompatible]);

  const changeLink = (nextId: string): void => {
    const nextLink = linkState.find((entry) => entry.id === nextId);
    if (nextLink === undefined) return;
    setLinkId(nextId);
    const channel = nextLink[surface];
    const stored = channel.visualTemplate;
    const nextSelection =
      stored !== "" && selectedVersion(templates, stored) !== null
        ? stored
        : firstSelectableSelection(templates, surface);
    setSelection(nextSelection);
    setParams(
      nextSelection === ""
        ? {}
        : resolvedParams(
            paramsSchemaForSelection(templates, nextSelection),
            stored === nextSelection ? channel.params : {},
          ),
    );
    setWidgetPosition(
      nextLink.widget.widgetPosition ??
        widgetDisplayForSelection(templates, nextSelection)?.defaultPosition ??
        "bottom-right",
    );
  };

  const changeSurface = (next: ChatLinkSurface): void => {
    if (next === surface) return;
    setSurface(next);
    const channel = link?.[next];
    const stored = channel?.visualTemplate ?? "";
    const nextSelection =
      stored !== "" && selectedVersion(templates, stored) !== null
        ? stored
        : next === "widget" && !widgetDisplayForSelection(templates, selection)
          ? firstSelectableSelection(templates, "widget")
          : selection;
    setSelection(nextSelection);
    setParams(
      nextSelection === ""
        ? {}
        : resolvedParams(
            paramsSchemaForSelection(templates, nextSelection),
            stored === nextSelection && channel !== undefined ? channel.params : params,
          ),
    );
    setWidgetPosition(
      channel?.widgetPosition ??
        widgetDisplayForSelection(templates, nextSelection)?.defaultPosition ??
        "bottom-right",
    );
  };

  const changeSelection = (next: string): void => {
    if (next === "") {
      setSelection("");
      setParams({});
      return;
    }
    setParams(mergeParamsForSelection(templates, selection, next, params));
    setSelection(next);
    const display = widgetDisplayForSelection(templates, next);
    if (display !== null && !display.allowedPositions.includes(widgetPosition)) {
      setWidgetPosition(display.defaultPosition);
    }
  };

  const reset = (): void => {
    setParams(defaultsForSchema(schema));
    toast.info("Paramètres réinitialisés aux valeurs du template.");
  };

  const reloadFromLink = (): void => {
    if (link === null) return;
    const channel = link[surface];
    const stored = channel.visualTemplate;
    const nextSelection =
      stored !== "" && selectedVersion(templates, stored) !== null
        ? stored
        : firstSelectableSelection(templates, surface);
    setSelection(nextSelection);
    setParams(
      nextSelection === ""
        ? {}
        : resolvedParams(
            paramsSchemaForSelection(templates, nextSelection),
            stored === nextSelection ? channel.params : {},
          ),
    );
    setWidgetPosition(
      link.widget.widgetPosition ??
        widgetDisplayForSelection(templates, nextSelection)?.defaultPosition ??
        "bottom-right",
    );
    setRefreshKey((key) => key + 1);
    toast.info("Valeurs rechargées depuis le lien.");
  };

  const save = async (): Promise<void> => {
    if (link === null || !canEdit || saving || selection === "") return;
    setSaving(true);
    try {
      const edited: ChannelDraft = {
        ...link[surface],
        visualTemplate: selection,
        params,
        widgetPosition,
      };
      const page = surface === "page" ? edited : link.page;
      const widget = surface === "widget" ? edited : link.widget;
      const response = await fetch(`/api/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels: {
            page: channelApiPayload(page),
            widget: channelApiPayload(widget),
          },
        }),
      });
      const json = (await response.json()) as { error?: unknown };
      if (!response.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Enregistrement impossible");
      }
      setLinkState((current) =>
        current.map((entry) => (entry.id === link.id ? { ...entry, page, widget } : entry)),
      );
      setRefreshKey((key) => key + 1);
      toast.success("Personnalisation enregistrée sur le chatbot.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur réseau, veuillez réessayer.");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (value: string, message: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error("Copie impossible dans ce navigateur.");
    }
  };

  const exportPayload = useMemo(
    () =>
      JSON.stringify(
        {
          linkId: link?.id ?? null,
          surface,
          template: selection,
          params,
        },
        null,
        2,
      ),
    [link?.id, params, selection, surface],
  );

  const download = (): void => {
    const blob = new Blob([exportPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${template?.key ?? "template"}-${version?.version ?? "params"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Paramètres exportés en JSON.");
  };

  const previewAbsoluteUrl = (): string => {
    if (typeof window === "undefined" || debouncedPreviewSrc === "") return "";
    return new URL(debouncedPreviewSrc, window.location.origin).toString();
  };

  const canSave = canEdit && link !== null && selection !== "" && !saving;

  return (
    <div className="studio-shell" data-mobile-panel={mobilePanel}>
      <header className="studio-topbar">
        <div className="studio-topbar-start">
          <a className="studio-icon-button" href="/liens" title="Retour aux chatbots">
            <StudioIcon name="back" />
          </a>
          <div className="studio-brand">
            <span className="studio-brand-mark">
              <StudioIcon name="sparkles" size={18} />
            </span>
            <span className="studio-brand-text">
              <strong>Studio template</strong>
              <small>Personnalisation en direct</small>
            </span>
            <span className="studio-dev-pill">DEV</span>
          </div>
        </div>

        <div className="studio-topbar-center">
          <label className="studio-select-field">
            <span>Chatbot</span>
            <select
              value={linkId}
              disabled={linkState.length === 0}
              onChange={(event) => changeLink(event.target.value)}
            >
              {linkState.length === 0 ? <option value="">Aucun chatbot</option> : null}
              {linkState.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} · {entry.type === "standard" ? "standard" : "spécifique"}
                </option>
              ))}
            </select>
          </label>

          <div className="studio-segment" role="tablist" aria-label="Surface de diffusion">
            {(["page", "widget"] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={surface === entry}
                className={`studio-segment-button${surface === entry ? " is-active" : ""}`}
                onClick={() => changeSurface(entry)}
              >
                <StudioIcon name={entry === "page" ? "layers" : "grid"} size={14} />
                {entry === "page" ? "Page" : "Widget"}
              </button>
            ))}
          </div>
        </div>

        <div className="studio-topbar-end">
          <button
            type="button"
            className="studio-icon-button"
            title="Copier les paramètres JSON"
            onClick={() => void copy(exportPayload, "Paramètres JSON copiés.")}
          >
            <StudioIcon name="copy" />
          </button>
          <button
            type="button"
            className="studio-icon-button"
            title="Télécharger les paramètres JSON"
            onClick={download}
          >
            <StudioIcon name="download" />
          </button>
          <button
            type="button"
            className="studio-icon-button"
            title="Copier le lien d’aperçu"
            onClick={() => void copy(previewAbsoluteUrl(), "Lien d’aperçu copié.")}
          >
            <StudioIcon name="link" />
          </button>
          {debouncedPreviewSrc === "" ? (
            <span className="studio-topbar-disabled">
              <StudioIcon name="eye" />
              Aperçu
            </span>
          ) : (
            <a
              className="studio-icon-button"
              href={debouncedPreviewSrc}
              target="_blank"
              rel="noreferrer"
              title="Ouvrir l’aperçu dans un nouvel onglet"
            >
              <StudioIcon name="external" />
            </a>
          )}
          <button
            type="button"
            className="btn small studio-save-button"
            disabled={!canSave}
            onClick={() => void save()}
          >
            <StudioIcon name="save" size={14} />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </header>

      <nav className="studio-mobile-tabs" aria-label="Panneaux du studio">
        {(
          [
            ["gallery", "Modèles", "grid"],
            ["preview", "Aperçu", "eye"],
            ["inspector", "Réglages", "sliders"],
          ] as const
        ).map(([panel, label, icon]) => (
          <button
            key={panel}
            type="button"
            className={`studio-mobile-tab${mobilePanel === panel ? " is-active" : ""}`}
            onClick={() => setMobilePanel(panel)}
          >
            <StudioIcon name={icon} size={15} />
            {label}
          </button>
        ))}
      </nav>

      <div className="studio-body">
        <StudioGallery
          templates={templates}
          selection={selection}
          surface={surface}
          search={gallerySearch}
          onSearchChange={setGallerySearch}
          onSelect={changeSelection}
        />

        <StudioPreview
          src={debouncedPreviewSrc}
          surface={surface}
          device={device}
          hasLink={link !== null}
          hasTemplates={templates.length > 0}
          onDeviceChange={setDevice}
          onRefresh={() => setRefreshKey((key) => key + 1)}
        />

        <StudioInspector
          schema={schema}
          params={params}
          onChange={setParams}
          template={template}
          selection={selection}
          surface={surface}
          widgetDisplay={widgetDisplay}
          widgetPosition={widgetPosition}
          onWidgetPositionChange={setWidgetPosition}
          onSelectionChange={changeSelection}
          tab={tab}
          onTabChange={setTab}
          onReset={reset}
          onReload={reloadFromLink}
          onSave={() => void save()}
          saving={saving}
          canEdit={canEdit}
          canSave={canSave}
          hasLink={link !== null}
        />
      </div>
    </div>
  );
}
