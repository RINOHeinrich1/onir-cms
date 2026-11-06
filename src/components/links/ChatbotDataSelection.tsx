"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { ConnaissanceDto } from "@/components/connaissances/types";
import type { MediaDto } from "@/components/medias/types";
import type { ChatLinkSources } from "@/domain/entities/chat";
import type { ChatbotDataSelection as ChatbotDataSelectionValue } from "@/domain/entities/chatbot-config";
import { ChatbotSearchToolFields } from "./ChatbotSearchToolFields";
import type { ChatbotSearchToolDraft, FicheDraft } from "./chatbot-config-draft";
import { selectableDataForChatbot } from "./chatbot-data-draft";

type DataSelection = ChatbotDataSelectionValue;

const PAGE_SIZE = 20;

type TabId = "connaissances" | "photos" | "liens" | "fiches";

type DataCounts = { connaissances: number; photos: number; liens: number };

type SelectableItem = {
  id: string;
  title: string;
  description: string;
  badge: "global" | "chatbot";
  thumbnail: string | null;
  url: string | null;
};

const TABS: Array<{ id: TabId; label: string; empty: string }> = [
  {
    id: "connaissances",
    label: "Connaissances",
    empty: "Aucune connaissance dans la bibliothèque.",
  },
  { id: "photos", label: "Photos", empty: "Aucune photo dans la bibliothèque." },
  { id: "liens", label: "Liens", empty: "Aucun lien dans la bibliothèque." },
  { id: "fiches", label: "Fiches", empty: "" },
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function excerpt(value: string, max = 140): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function toSelectable(
  items: Array<ConnaissanceDto | MediaDto>,
  kind: "connaissance" | "photo" | "lien",
): SelectableItem[] {
  return items
    .filter((item) => item.actif !== false)
    .map((item) => {
      const isGlobal = item.chatLinkIds.length === 0;
      const badge: "global" | "chatbot" = isGlobal ? "global" : "chatbot";
      if (kind === "connaissance") {
        const connaissance = item as ConnaissanceDto;
        return {
          id: connaissance.id,
          title: connaissance.titre,
          description: connaissance.contenu,
          badge,
          thumbnail: null,
          url: null,
        };
      }
      const media = item as MediaDto;
      return {
        id: media.id,
        title: media.libelle,
        description: media.description,
        badge,
        thumbnail: kind === "photo" ? `/api/medias/${media.id}/file` : null,
        url: media.url,
      };
    });
}

/**
 * Sélecteur des contenus de la bibliothèque, pensé pour des centaines
 * d'éléments : recherche, filtre sélection, pagination et sélection en masse.
 * La bibliothèque n'est jamais modifiée.
 */
export function ChatbotDataSelection({
  selection,
  onChange,
  chatLinkId,
  onCountsChange,
  searchTool,
  onSearchToolChange,
  fiches,
  publicLink,
  sources,
  onSourcesChange,
  usageHint,
  onUsageHintChange,
}: {
  selection: DataSelection;
  onChange: (next: DataSelection) => void;
  /** Édition : inclut aussi les données déjà scopées à ce chatbot. */
  chatLinkId?: string | null | undefined;
  onCountsChange?: ((counts: DataCounts) => void) | undefined;
  searchTool: ChatbotSearchToolDraft;
  onSearchToolChange: (next: ChatbotSearchToolDraft) => void;
  fiches: FicheDraft[];
  publicLink: boolean;
  sources: ChatLinkSources;
  onSourcesChange: (next: ChatLinkSources) => void;
  usageHint: string;
  onUsageHintChange: (next: string) => void;
}) {
  const modeName = useId();
  const [connaissances, setConnaissances] = useState<ConnaissanceDto[]>([]);
  const [medias, setMedias] = useState<MediaDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("connaissances");
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const [connaissancesResponse, mediasResponse] = await Promise.all([
        fetch("/api/connaissances", { cache: "no-store" }),
        fetch("/api/medias", { cache: "no-store" }),
      ]);
      if (!connaissancesResponse.ok || !mediasResponse.ok) {
        throw new Error("Chargement impossible");
      }
      const connaissancesJson = (await connaissancesResponse.json()) as {
        connaissances?: ConnaissanceDto[];
      };
      const mediasJson = (await mediasResponse.json()) as { medias?: MediaDto[] };
      setConnaissances(connaissancesJson.connaissances ?? []);
      setMedias(mediasJson.medias ?? []);
    } catch {
      setLoadError("Impossible de charger la bibliothèque.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const currentChatLinkId = chatLinkId?.trim() ?? "";
  const items = useMemo(() => {
    const connaissanceItems = toSelectable(
      selectableDataForChatbot(connaissances, currentChatLinkId),
      "connaissance",
    );
    const photos = selectableDataForChatbot(
      medias.filter((media) => media.type === "photo"),
      currentChatLinkId,
    );
    const liens = selectableDataForChatbot(
      medias.filter((media) => media.type === "lien"),
      currentChatLinkId,
    );
    return {
      connaissances: connaissanceItems,
      photos: toSelectable(photos, "photo"),
      liens: toSelectable(liens, "lien"),
    };
  }, [connaissances, medias, currentChatLinkId]);

  useEffect(() => {
    if (loading) return;
    onCountsChange?.({
      connaissances: items.connaissances.length,
      photos: items.photos.length,
      liens: items.liens.length,
    });
  }, [items, loading, onCountsChange]);

  const tabCount = (id: TabId): number => (id === "fiches" ? fiches.length : items[id].length);
  const contentEnabled =
    tab === "connaissances"
      ? sources.connaissances
      : tab === "photos"
        ? sources.phototheque
        : tab === "liens"
          ? sources.lien
          : true;
  const activeItems = tab === "fiches" ? [] : items[tab];
  const selectedIds =
    selection.mode !== "selected" || tab === "fiches"
      ? []
      : tab === "connaissances"
        ? selection.connaissanceIds
        : selection.mediaIds;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedTotal =
    selection.mode === "selected"
      ? selection.connaissanceIds.length + selection.mediaIds.length
      : 0;
  const effectiveOnlySelected = onlySelected && selection.mode === "selected";

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    return activeItems.filter((item) => {
      if (effectiveOnlySelected && !selectedSet.has(item.id)) return false;
      if (needle === "") return true;
      return normalize(`${item.title} ${item.description}`).includes(needle);
    });
  }, [activeItems, effectiveOnlySelected, query, selectedSet]);

  const visibleItems = filtered.slice(0, visible);
  const visibleIds = visibleItems.map((item) => item.id);

  const changeTab = (next: TabId): void => {
    setTab(next);
    setQuery("");
    setOnlySelected(false);
    setVisible(PAGE_SIZE);
  };

  const setMode = (mode: DataSelection["mode"]): void => {
    if (mode === "all") {
      onChange({ mode: "all", connaissanceIds: [], mediaIds: [] });
      return;
    }
    onChange({ ...selection, mode: "selected" });
  };

  const updateSelection = (kind: "connaissances" | "media", ids: string[]): void => {
    const next: DataSelection = {
      ...selection,
      mode: "selected",
      connaissanceIds:
        kind === "connaissances"
          ? ids
          : selection.mode === "selected"
            ? selection.connaissanceIds
            : [],
      mediaIds: kind === "media" ? ids : selection.mode === "selected" ? selection.mediaIds : [],
    };
    onChange(next);
  };

  const currentIds = (): string[] => {
    if (tab === "fiches") return [];
    if (tab === "connaissances") {
      return selection.mode === "selected" ? selection.connaissanceIds : [];
    }
    return selection.mode === "selected" ? selection.mediaIds : [];
  };

  const toggleItem = (id: string): void => {
    const base = currentIds();
    const next = base.includes(id) ? base.filter((entry) => entry !== id) : [...base, id];
    updateSelection(tab === "connaissances" ? "connaissances" : "media", next);
  };

  const selectPage = (): void => {
    const base = currentIds();
    const merged = [...new Set([...base, ...visibleIds])];
    updateSelection(tab === "connaissances" ? "connaissances" : "media", merged);
  };

  const clearAll = (): void => {
    onChange({ mode: "selected", connaissanceIds: [], mediaIds: [] });
  };

  return (
    <section className="chatbot-data-selection" aria-label="Contenus de l’organisation">
      {loading ? <p className="hint">Chargement de la bibliothèque…</p> : null}
      {loadError !== null ? (
        <div className="alert error">
          {loadError}{" "}
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Réessayer
          </button>
        </div>
      ) : null}

      {!loading && loadError === null ? (
        <>
          <div className="chatbot-library-toggles">
            <label className="chatbot-tool-toggle">
              <input
                type="checkbox"
                className="chatbot-tool-toggle-input"
                checked={sources.connaissances}
                onChange={(event) =>
                  onSourcesChange({ ...sources, connaissances: event.target.checked })
                }
              />
              <span className="chatbot-tool-toggle-track" aria-hidden="true" />
              <span className="chatbot-tool-toggle-text">Connaissances</span>
            </label>
            <label className="chatbot-tool-toggle">
              <input
                type="checkbox"
                className="chatbot-tool-toggle-input"
                checked={sources.phototheque}
                onChange={(event) =>
                  onSourcesChange({ ...sources, phototheque: event.target.checked })
                }
              />
              <span className="chatbot-tool-toggle-track" aria-hidden="true" />
              <span className="chatbot-tool-toggle-text">Photos</span>
            </label>
            <label className="chatbot-tool-toggle">
              <input
                type="checkbox"
                className="chatbot-tool-toggle-input"
                checked={sources.lien}
                onChange={(event) => onSourcesChange({ ...sources, lien: event.target.checked })}
              />
              <span className="chatbot-tool-toggle-track" aria-hidden="true" />
              <span className="chatbot-tool-toggle-text">Liens</span>
            </label>
            <label className="chatbot-tool-toggle">
              <input
                type="checkbox"
                className="chatbot-tool-toggle-input"
                checked={searchTool.enabled}
                onChange={(event) =>
                  onSearchToolChange({ ...searchTool, enabled: event.target.checked })
                }
              />
              <span className="chatbot-tool-toggle-track" aria-hidden="true" />
              <span className="chatbot-tool-toggle-text">Fiches</span>
            </label>
          </div>

          <div className="chatbot-data-tabs" role="tablist" aria-label="Type de contenu">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className={`chatbot-data-tab${tab === entry.id ? " active" : ""}`}
                onClick={() => changeTab(entry.id)}
              >
                {entry.label}
                <span className="badge muted">{tabCount(entry.id)}</span>
              </button>
            ))}
          </div>

          {tab === "fiches" ? (
            searchTool.enabled ? (
              <ChatbotSearchToolFields
                value={searchTool}
                onChange={onSearchToolChange}
                fiches={fiches}
                publicLink={publicLink}
                usageHint={usageHint}
                onUsageHintChange={onUsageHintChange}
              />
            ) : (
              <p className="hint">
                Activez « Fiches » au-dessus des onglets pour utiliser et configurer l’outil de
                recherche.
              </p>
            )
          ) : !contentEnabled ? (
            <p className="hint">
              Activez «{" "}
              {tab === "connaissances" ? "Connaissances" : tab === "photos" ? "Photos" : "Liens"} »
              au-dessus des onglets pour sélectionner ses contenus.
            </p>
          ) : (
            <>
              <fieldset className="chatbot-data-mode">
                <legend>Contenus utilisés par ce chatbot</legend>
                <label className="field checkbox">
                  <input
                    type="radio"
                    name={modeName}
                    checked={selection.mode === "all"}
                    onChange={() => setMode("all")}
                  />
                  Toute la bibliothèque (par défaut)
                </label>
                <label className="field checkbox">
                  <input
                    type="radio"
                    name={modeName}
                    checked={selection.mode === "selected"}
                    onChange={() => setMode("selected")}
                  />
                  Choisir des contenus
                </label>
                <p className="hint">
                  {selection.mode === "selected"
                    ? `${selectedTotal} contenu(s) sélectionné(s) + les contenus déjà rattachés à ce chatbot.`
                    : "Tous les contenus de la bibliothèque sont accessibles, sans modifier leur portée."}
                </p>
              </fieldset>

              {selection.mode === "all" ? (
                <div className="chatbot-data-summary">
                  <p className="hint">Toute la bibliothèque est accessible.</p>
                  <div className="chatbot-data-counts">
                    {(["connaissances", "photos", "liens"] as const).map((id) => (
                      <span key={id} className="badge muted">
                        {TABS.find((entry) => entry.id === id)?.label}{" "}
                        <strong>{items[id].length}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="chatbot-data-filters">
                    <label className="field">
                      Rechercher
                      <input
                        type="search"
                        value={query}
                        placeholder="Titre, libellé ou description…"
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setVisible(PAGE_SIZE);
                        }}
                      />
                    </label>
                    <label className="field checkbox">
                      <input
                        type="checkbox"
                        checked={effectiveOnlySelected}
                        onChange={(event) => {
                          setOnlySelected(event.target.checked);
                          setVisible(PAGE_SIZE);
                        }}
                      />
                      Sélectionnés uniquement ({selectedIds.length})
                    </label>
                  </div>

                  <div className="tools chatbot-data-bulk">
                    <button
                      type="button"
                      className="btn ghost small"
                      disabled={loading}
                      onClick={() => void load()}
                    >
                      {loading ? "Actualisation…" : "Actualiser"}
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      disabled={visibleIds.length === 0}
                      onClick={selectPage}
                    >
                      Tout sélectionner sur cette page
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      disabled={selectedTotal === 0}
                      onClick={clearAll}
                    >
                      Tout désélectionner
                    </button>
                    <span className="hint">
                      {filtered.length} résultat(s) · {visibleItems.length} affiché(s)
                    </span>
                  </div>

                  {activeItems.length === 0 ? (
                    <p className="hint">{TABS.find((entry) => entry.id === tab)?.empty}</p>
                  ) : filtered.length === 0 ? (
                    <p className="hint">Aucun contenu ne correspond à cette recherche.</p>
                  ) : (
                    <ul className="chatbot-data-select-list">
                      {visibleItems.map((item) => (
                        <li key={item.id}>
                          <label className="chatbot-data-select-item">
                            <input
                              type="checkbox"
                              checked={selectedSet.has(item.id)}
                              onChange={() => toggleItem(item.id)}
                            />
                            {item.thumbnail === null ? (
                              <span className="chatbot-data-thumb placeholder" aria-hidden="true">
                                {tab === "liens" ? "↗" : "A"}
                              </span>
                            ) : (
                              // biome-ignore lint/performance/noImgElement: fichier servi par route privée (uuid)
                              <img
                                className="chatbot-data-thumb"
                                src={item.thumbnail}
                                alt=""
                                loading="lazy"
                              />
                            )}
                            <span className="chatbot-data-select-body">
                              <strong>{item.title}</strong>
                              {item.description.trim() === "" ? null : (
                                <span className="hint">{excerpt(item.description)}</span>
                              )}
                              {item.url === null ? null : (
                                <span className="hint chatbot-data-url">{item.url}</span>
                              )}
                            </span>
                            <span className={`badge ${item.badge === "global" ? "muted" : "info"}`}>
                              {item.badge === "global" ? "Source" : "Ce chatbot"}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}

                  {visible < filtered.length ? (
                    <div className="tools">
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => setVisible((current) => current + PAGE_SIZE)}
                      >
                        Charger plus ({filtered.length - visible} restant(s))
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
