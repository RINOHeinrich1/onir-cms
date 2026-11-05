"use client";

import { useEffect, useMemo, useState } from "react";
import type { FicheStatusDefinition } from "@/domain/entities/fiche-status";
import {
  FICHE_SORT_MODES,
  FICHE_STATUS_MODES,
  type FicheSortMode,
  type FicheStatusMode,
} from "@/domain/fiche-search-tool";
import {
  type ChatbotSearchToolDraft,
  type FicheDraft,
  searchToolDraftViolations,
} from "./chatbot-config-draft";
import { FicheScopeTagInput } from "./FicheScopeTagInput";

type Props = {
  value: ChatbotSearchToolDraft;
  onChange: (next: ChatbotSearchToolDraft) => void;
  /** Fiches de collecte du chatbot (fallback avant chargement de l'organisation). */
  fiches: FicheDraft[];
  /** Lien public : les modes backoffice et la portée organisation sont interdits. */
  publicLink: boolean;
};

type StatusOption = {
  key: string;
  label: string;
  ficheKey: string;
};

const STATUS_MODE_LABELS: Record<FicheStatusMode, string> = {
  hidden_fixed: "Statut imposé masqué (public)",
  internal_filter: "Statut visible par le modèle (backoffice)",
  all: "Aucun filtre de statut (backoffice)",
};

const SORT_MODE_LABELS: Record<FicheSortMode, string> = {
  fair_rotation: "Rotation équitable",
  created_at: "Date de création",
  relevance: "Pertinence (non implémenté)",
};

type FicheOption = {
  key: string;
  label: string;
  statuses?: FicheStatusDefinition[];
};

/** Statuts non archivés des fiches sélectionnées (union par clé). */
function statusOptionsFor(fiches: FicheOption[], ficheTypes: string[]): StatusOption[] {
  const selected = fiches.filter((fiche) => ficheTypes.includes(fiche.key));
  const byKey = new Map<string, StatusOption>();
  for (const fiche of selected) {
    for (const status of fiche.statuses ?? []) {
      if (status.archivedAt !== null) continue;
      if (byKey.has(status.key)) continue;
      byKey.set(status.key, { key: status.key, label: status.label, ficheKey: fiche.key });
    }
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

function nonArchivedStatusKeys(fiches: FicheOption[], ficheTypes: string[]): Set<string> {
  return new Set(statusOptionsFor(fiches, ficheTypes).map((status) => status.key));
}

/**
 * Éditeur de la configuration versionnée de l'outil `search_fiches`
 * (ADR-0067 §2.5, §4.9). Les modes backoffice sont désactivés dès que le lien
 * est public ; la garde serveur reste la source de vérité.
 */
export function ChatbotSearchToolFields({ value, onChange, fiches, publicLink }: Props) {
  const [availableFiches, setAvailableFiches] = useState<FicheOption[]>(() =>
    fiches.map((fiche) => ({ key: fiche.key, label: fiche.label, statuses: fiche.statuses ?? [] })),
  );

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/fiches-collecte")
      .then(async (response) =>
        response.ok ? ((await response.json()) as { fiches?: unknown }) : null,
      )
      .then((json) => {
        if (cancelled || !Array.isArray(json?.fiches)) return;
        const options = json.fiches
          .filter(
            (entry): entry is { key: string; label: string; statuses?: FicheStatusDefinition[] } =>
              entry !== null &&
              typeof entry === "object" &&
              typeof (entry as { key?: unknown }).key === "string" &&
              typeof (entry as { label?: unknown }).label === "string",
          )
          .map((entry) => ({ key: entry.key, label: entry.label, statuses: entry.statuses ?? [] }));
        if (options.length > 0) setAvailableFiches(options);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const availableStatuses = useMemo(
    () => statusOptionsFor(availableFiches, value.ficheTypes),
    [availableFiches, value.ficheTypes],
  );
  const violations = useMemo(
    () => searchToolDraftViolations(value, publicLink),
    [value, publicLink],
  );
  const unknownStatusKeys = value.fixedStatusKeys.filter(
    (key) => !availableStatuses.some((status) => status.key === key),
  );

  const changeFiches = (nextTypes: string[]): void => {
    const stillAvailable = nonArchivedStatusKeys(availableFiches, nextTypes);
    onChange({
      ...value,
      ficheTypes: nextTypes,
      fixedStatusKeys: value.fixedStatusKeys.filter((status) => stillAvailable.has(status)),
    });
  };

  const toggleStatusKey = (key: string): void => {
    onChange({
      ...value,
      fixedStatusKeys: value.fixedStatusKeys.includes(key)
        ? value.fixedStatusKeys.filter((entry) => entry !== key)
        : [...value.fixedStatusKeys, key],
    });
  };

  const changeStatusMode = (mode: FicheStatusMode): void => {
    if (publicLink && mode !== "hidden_fixed") return;
    onChange({ ...value, statusMode: mode });
  };

  return (
    <fieldset className="fieldset chatbot-search-tool" aria-label="Outil de recherche">
      <legend>Outil de recherche de fiches</legend>
      <p className="hint">
        Ces politiques sont versionnées avec le chatbot. Elles s’appliquent avant toute recherche et
        ne sont jamais modifiables par le modèle (ADR-0067).
      </p>

      <div className="chatbot-search-tool-config">
        <FicheScopeTagInput
          options={availableFiches}
          value={value.ficheTypes}
          onChange={changeFiches}
        />

        <label className="field">
          Mode de statut
          <select
            value={value.statusMode}
            onChange={(event) => changeStatusMode(event.target.value as FicheStatusMode)}
          >
            {FICHE_STATUS_MODES.map((mode) => (
              <option key={mode} value={mode} disabled={publicLink && mode !== "hidden_fixed"}>
                {STATUS_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          {publicLink ? (
            <span className="hint">
              Lien public : les modes backoffice <code>internal_filter</code> et <code>all</code>{" "}
              sont désactivés et refusés par le serveur.
            </span>
          ) : null}
        </label>

        <div className="field">
          <span>Statuts fixes appliqués</span>
          {availableStatuses.length === 0 ? (
            <p className="hint">
              Aucun statut non archivé disponible pour les fiches sélectionnées. Ajoutez des statuts
              dans la fiche de collecte.
            </p>
          ) : (
            <div className="chatbot-fiche-options">
              {availableStatuses.map((status) => (
                <label key={status.key} className="chatbot-fiche-option">
                  <input
                    type="checkbox"
                    checked={value.fixedStatusKeys.includes(status.key)}
                    disabled={value.statusMode === "all"}
                    onChange={() => toggleStatusKey(status.key)}
                  />
                  <span>
                    <strong>{status.label}</strong>
                    <small> {status.key}</small>
                  </span>
                </label>
              ))}
            </div>
          )}
          <span className="hint">
            {value.statusMode === "all"
              ? "Mode « aucun filtre » : les statuts fixes ne sont pas appliqués."
              : "Le filtre est appliqué automatiquement ; il n’est jamais transmis au modèle sur un lien public."}
          </span>
          {unknownStatusKeys.length > 0 ? (
            <p className="alert error">
              Statut(s) fixe(s) introuvable(s) ou archivé(s) : {unknownStatusKeys.join(", ")}.
              Corrigez la configuration.
            </p>
          ) : null}
        </div>

        <label className="field">
          Tri des résultats
          <select
            value={value.sortMode}
            onChange={(event) =>
              onChange({ ...value, sortMode: event.target.value as FicheSortMode })
            }
          >
            {FICHE_SORT_MODES.map((mode) => (
              <option key={mode} value={mode} disabled={mode === "relevance"}>
                {SORT_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <span className="hint">
            Le tri « pertinence » est visible mais non disponible dans le MVP.
          </span>
        </label>
      </div>

      {violations.length > 0 ? (
        <p className="alert error" role="alert">
          {violations.join(" · ")}
        </p>
      ) : null}
    </fieldset>
  );
}
