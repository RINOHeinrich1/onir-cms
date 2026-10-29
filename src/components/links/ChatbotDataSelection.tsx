"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { ConnaissanceDto } from "@/components/connaissances/types";
import type { MediaDto } from "@/components/medias/types";
import type { ChatbotDataSelection as ChatbotDataSelectionValue } from "@/domain/entities/chatbot-config";
import { selectableDataForChatbot } from "./chatbot-data-draft";

type DataSelection = ChatbotDataSelectionValue;

const PAGE_SIZE = 20;

type TabId = "connaissances" | "photos" | "liens";

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
  { id: "connaissances", label: "Connaissances", empty: "Aucune connaissance globale." },
  { id: "photos", label: "Photothèque", empty: "Aucune photo globale." },
  { id: "liens", label: "Liens", empty: "Aucun lien global." },
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
 * Sélecteur de données existantes, pensé pour des centaines d'éléments :
 * recherche, filtre sélection, pagination « charger plus » et sélection en
 * masse. Les données globales ne sont jamais modifiées.
 */
export function ChatbotDataSelection({
  selection,
  onChange,
  chatLinkId,
  onCountsChange,
}: {
  selection: DataSelection;
  onChange: (next: DataSelection) => void;
  /** Édition : inclut aussi les données déjà scopées à ce chatbot. */
  chatLinkId?: string | null | undefined;
  onCountsChange?: ((counts: DataCounts) => void) | undefined;
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
      setLoadError("Impossible de charger les données existantes.");
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

  const activeItems = items[tab];
  const selectedIds =
    selection.mode !== "selected"
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
    <section className="chatbot-data-selection" aria-label="Sélection des données existantes">
      <fieldset className="chatbot-data-mode">
        <legend>Données utilisées par ce chatbot</legend>
        <label className="field checkbox">
          <input
            type="radio"
            name={modeName}
            checked={selection.mode === "all"}
            onChange={() => setMode("all")}
          />
          Utiliser toutes les données globales (par défaut)
        </label>
        <label className="field checkbox">
          <input
            type="radio"
            name={modeName}
            checked={selection.mode === "selected"}
            onChange={() => setMode("selected")}
          />
          Choisir des données
        </label>
        <p className="hint">
          {selection.mode === "selected"
            ? `Mode personnalisé : ${selectedTotal} élément(s) sélectionné(s) + les données déjà rattachées à ce chatbot.`
            : "Toutes les données globales sont accessibles, sans modification de leur portée."}
        </p>
      </fieldset>

      {loading ? <p className="hint">Chargement des données…</p> : null}
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
          <div className="chatbot-data-tabs" role="tablist" aria-label="Nature des données">
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
                <span className="badge muted">{items[entry.id].length}</span>
              </button>
            ))}
          </div>

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
                disabled={selection.mode !== "selected"}
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
            <p className="hint">Aucun élément ne correspond à cette recherche.</p>
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
                      {item.badge === "global" ? "Global" : "Ce chatbot"}
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
      ) : null}
    </section>
  );
}
