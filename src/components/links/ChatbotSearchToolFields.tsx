"use client";

import { useMemo } from "react";
import {
  FICHE_SCOPES,
  FICHE_SORT_MODES,
  FICHE_STATUS_MODES,
  type FicheScope,
  type FicheSortMode,
  type FicheStatusMode,
} from "@/domain/fiche-search-tool";
import {
  type ChatbotSearchToolDraft,
  type FicheDraft,
  searchToolDraftViolations,
} from "./chatbot-config-draft";

type Props = {
  value: ChatbotSearchToolDraft;
  onChange: (next: ChatbotSearchToolDraft) => void;
  /** Fiches de collecte du chatbot (snapshot versionné). */
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

const SCOPE_LABELS: Record<FicheScope, string> = {
  chat_link: "Fiches rattachées au chatbot",
  organization: "Toute l’organisation (backoffice)",
};

/** Statuts non archivés des fiches sélectionnées (union par clé). */
function statusOptionsFor(fiches: FicheDraft[], ficheTypes: string[]): StatusOption[] {
  const selected =
    ficheTypes.length === 0 ? fiches : fiches.filter((fiche) => ficheTypes.includes(fiche.key));
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

function nonArchivedStatusKeys(fiches: FicheDraft[], ficheTypes: string[]): Set<string> {
  return new Set(statusOptionsFor(fiches, ficheTypes).map((status) => status.key));
}

/**
 * Éditeur de la configuration versionnée de l'outil `search_fiches`
 * (ADR-0067 §2.5, §4.9). Les modes backoffice sont désactivés dès que le lien
 * est public ; la garde serveur reste la source de vérité.
 */
export function ChatbotSearchToolFields({ value, onChange, fiches, publicLink }: Props) {
  const availableStatuses = useMemo(
    () => statusOptionsFor(fiches, value.ficheTypes),
    [fiches, value.ficheTypes],
  );
  const violations = useMemo(
    () => searchToolDraftViolations(value, publicLink),
    [value, publicLink],
  );
  const unknownStatusKeys = value.fixedStatusKeys.filter(
    (key) => !availableStatuses.some((status) => status.key === key),
  );

  const toggleFicheType = (key: string): void => {
    const nextTypes = value.ficheTypes.includes(key)
      ? value.ficheTypes.filter((entry) => entry !== key)
      : [...value.ficheTypes, key];
    const stillAvailable = nonArchivedStatusKeys(fiches, nextTypes);
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

  const changeScope = (scope: FicheScope): void => {
    if (publicLink && scope !== "chat_link") return;
    onChange({ ...value, scope });
  };

  return (
    <fieldset className="fieldset chatbot-search-tool" aria-label="Outil de recherche">
      <legend>Outil de recherche de fiches</legend>
      <p className="hint">
        Ces politiques sont versionnées avec le chatbot. Elles s’appliquent avant toute recherche et
        ne sont jamais modifiables par le modèle (ADR-0067).
      </p>

      <label className="chatbot-tool-toggle">
        <input
          type="checkbox"
          className="chatbot-tool-toggle-input"
          checked={value.enabled}
          onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
        />
        <span className="chatbot-tool-toggle-track" aria-hidden="true" />
        <span className="chatbot-tool-toggle-text">Activer l’outil de recherche</span>
      </label>
      <p className="hint">
        Désactivé par défaut : le chatbot répond normalement, sans outil de recherche. Activez
        explicitement l’outil pour ce chatbot.
      </p>

      <div className="field">
        <span>Types de fiches interrogés</span>
        {fiches.length === 0 ? (
          <p className="hint">
            Aucune fiche de collecte dans ce chatbot : laissez vide pour interroger tous les types
            rattachés.
          </p>
        ) : (
          <div className="chatbot-fiche-options">
            {fiches.map((fiche) => (
              <label key={fiche.id} className="chatbot-fiche-option">
                <input
                  type="checkbox"
                  checked={value.ficheTypes.includes(fiche.key)}
                  onChange={() => toggleFicheType(fiche.key)}
                />
                <span>
                  <strong>{fiche.label || fiche.key}</strong>
                  <small> {fiche.key}</small>
                </span>
              </label>
            ))}
          </div>
        )}
        <span className="hint">
          Vide = tous les types rattachés au chatbot, une fois l’outil activé. Sélectionnez un ou
          plusieurs types pour restreindre la recherche.
        </span>
      </div>

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
            Lien public : les modes backoffice <code>internal_filter</code> et <code>all</code> sont
            désactivés et refusés par le serveur.
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

      <label className="field">
        Portée de la recherche
        <select
          value={value.scope}
          onChange={(event) => changeScope(event.target.value as FicheScope)}
        >
          {FICHE_SCOPES.map((scope) => (
            <option key={scope} value={scope} disabled={publicLink && scope !== "chat_link"}>
              {SCOPE_LABELS[scope]}
            </option>
          ))}
        </select>
        {publicLink ? (
          <span className="hint">
            Lien public : la portée organisation est désactivée et refusée par le serveur.
          </span>
        ) : null}
      </label>

      {violations.length > 0 ? (
        <p className="alert error" role="alert">
          {violations.join(" · ")}
        </p>
      ) : null}
    </fieldset>
  );
}
