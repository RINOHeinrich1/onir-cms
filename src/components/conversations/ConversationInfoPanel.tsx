"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import type { FicheInstanceStatus } from "@/domain/entities/conversation-fiche-instance";
import type {
  ConversationFicheView,
  ConversationFieldsView,
  ConversationFieldView,
} from "@/domain/entities/conversation-field";

export const OPEN_CONVERSATION_INFO_EVENT = "conversation-info-open";

type SaveState = { key: string; status: "saving" | "saved" | "error" } | null;

const STATUS_LABELS: Record<FicheInstanceStatus, string> = {
  detected: "Détectée",
  active: "Active",
  paused: "En pause",
  complete: "Complète",
  abandoned: "Abandonnée",
};

function sourceLabel(source: ConversationFieldView["source"]): string {
  if (source === "manual") return "Manuel";
  if (source === "ai") return "IA";
  if (source === "visitor") return "Visiteur";
  if (source === "system") return "Système";
  return "—";
}

function relativeTime(iso: string | null): string {
  if (iso === null) return "jamais";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "—";
  const minutes = Math.floor(Math.max(0, Date.now() - time) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function FieldEditor({
  field,
  fields,
  canEdit,
  saving,
  onSave,
}: {
  field: ConversationFieldView;
  fields: ConversationFieldView[];
  canEdit: boolean;
  saving: boolean;
  onSave: (fieldName: string, value: unknown) => Promise<boolean>;
}) {
  const [value, setValue] = useState<unknown>(field.value);
  const [dirty, setDirty] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (dirty || focused) return;
    setValue(field.value);
  }, [field.value, dirty, focused]);

  const commit = (next: unknown): void => {
    setValue(next);
    setDirty(true);
    void onSave(field.name, next).then((saved) => {
      if (saved) setDirty(false);
    });
  };

  const requiredHint =
    field.requiredIf === undefined
      ? null
      : (() => {
          const target = fields.find((entry) => entry.name === field.requiredIf?.field);
          return `Requis si « ${target?.label ?? field.requiredIf.field} » = « ${field.requiredIf.equals} »`;
        })();

  if (field.type === "file") {
    return (
      <div className="info-field-value">
        <span className="info-file-count">
          {field.attachmentCount} pièce{field.attachmentCount > 1 ? "s" : ""} jointe
          {field.attachmentCount > 1 ? "s" : ""}
        </span>
        <span className="hint">Les pièces se déposent depuis la conversation.</span>
      </div>
    );
  }

  if (field.type === "multi") {
    const selected = asList(value);
    return (
      <div className="info-field-value">
        <div className="info-options">
          {(field.options ?? []).map((option) => (
            <label key={option} className="info-option">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                disabled={!canEdit}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option);
                  commit(next);
                }}
              />
              {option}
            </label>
          ))}
        </div>
        {requiredHint !== null ? <span className="info-hint">{requiredHint}</span> : null}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="info-field-value">
        <select
          className="input"
          aria-label={field.label}
          value={asText(value)}
          disabled={!canEdit || saving}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => commit(event.target.value)}
        >
          <option value="">— Choisir —</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {requiredHint !== null ? <span className="info-hint">{requiredHint}</span> : null}
      </div>
    );
  }

  const multiline = field.type === "textarea";
  return (
    <div className="info-field-value">
      {multiline ? (
        <textarea
          className="input"
          aria-label={field.label}
          rows={3}
          placeholder={field.missing ? "À compléter" : undefined}
          value={asText(value)}
          disabled={!canEdit || saving}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (dirty) commit(value);
          }}
          onChange={(event) => {
            setValue(event.target.value);
            setDirty(true);
          }}
        />
      ) : (
        <input
          className="input"
          aria-label={field.label}
          type={field.type === "email" ? "email" : field.type === "url" ? "url" : "text"}
          placeholder={field.missing ? "À compléter" : undefined}
          value={asText(value)}
          disabled={!canEdit || saving}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (dirty) commit(value);
          }}
          onChange={(event) => {
            setValue(event.target.value);
            setDirty(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      )}
      {requiredHint !== null ? <span className="info-hint">{requiredHint}</span> : null}
    </div>
  );
}

function FicheSection({
  fiche,
  canEdit,
  saveState,
  onSave,
}: {
  fiche: ConversationFicheView;
  canEdit: boolean;
  saveState: SaveState;
  onSave: (instanceId: string | null, fieldName: string, value: unknown) => Promise<boolean>;
}) {
  const mandatory = fiche.fields.filter((field) => field.requiredNow);
  const optional = fiche.fields.filter((field) => !field.requiredNow);
  const key = (fieldName: string): string => `${fiche.instanceId ?? fiche.ficheKey}:${fieldName}`;

  const renderField = (field: ConversationFieldView): ReactNode => {
    const fieldKey = key(field.name);
    return (
      <div key={fieldKey} className={`info-field ${field.missing ? "is-missing" : ""}`}>
        <div className="info-field-head">
          <span className="info-field-label">
            {field.label}
            {field.requiredNow ? <span className="required-mark"> *</span> : null}
          </span>
          <span className={`info-source ${field.source ?? "empty"}`}>
            {field.missing ? "Manquant" : sourceLabel(field.source)}
          </span>
        </div>
        <FieldEditor
          field={field}
          fields={fiche.fields}
          canEdit={canEdit}
          saving={saveState?.key === fieldKey && saveState.status === "saving"}
          onSave={(fieldName, value) => onSave(fiche.instanceId, fieldName, value)}
        />
        {saveState?.key === fieldKey && saveState.status === "saved" ? (
          <span className="info-saved">Enregistré</span>
        ) : null}
      </div>
    );
  };

  return (
    <section className="info-section">
      <div className="info-field-head">
        <h3>
          {fiche.label}{" "}
          <span className={`badge ${fiche.status === "active" ? "" : "muted"}`}>
            {STATUS_LABELS[fiche.status]}
          </span>
        </h3>
        <span className={fiche.requiredMissing > 0 ? "info-missing" : "info-complete"}>
          {fiche.requiredCollected}/{fiche.requiredTotal} obligatoires
        </span>
      </div>
      {mandatory.length > 0 ? (
        <>
          <h4 className="hint">Obligatoires</h4>
          {mandatory.map(renderField)}
        </>
      ) : null}
      {optional.length > 0 ? (
        <>
          <h4 className="hint">Facultatives</h4>
          {optional.map(renderField)}
        </>
      ) : null}
      {fiche.fields.length === 0 ? (
        <p className="hint">Cette fiche ne déclare aucun champ.</p>
      ) : null}
    </section>
  );
}

/**
 * Panneau responsive des informations à collecter (ADR-0045 / ADR-0049).
 * Gère les conversations multi-fiches : une section par instance, sans
 * mélange des champs entre fiches.
 */
export function ConversationInfoPanel({
  conversationId,
  showTrigger = true,
}: {
  conversationId: string;
  showTrigger?: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<ConversationFieldsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>(null);
  const [mounted, setMounted] = useState(false);
  const lastRefreshAttempt = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/fields`,
        { cache: "no-store" },
      );
      const json = (await response.json()) as ConversationFieldsView & { error?: string };
      if (!response.ok) {
        setSnapshot(null);
        setError(
          response.status === 404
            ? "Conversation introuvable ou supprimée."
            : (json.error ?? "Chargement des informations impossible"),
        );
        return;
      }
      setSnapshot(json);
      setError(null);
    } catch {
      setError("Chargement des informations impossible");
    }
  }, [conversationId]);

  const refresh = useCallback(async (): Promise<void> => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const active = snapshot?.fiches?.find((fiche) => fiche.status === "active");
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/fields/refresh`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            active?.instanceId === null || active?.instanceId === undefined
              ? {}
              : { ficheInstanceId: active.instanceId },
          ),
        },
      );
      const json = (await response.json()) as ConversationFieldsView & { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Analyse IA impossible");
        return;
      }
      setSnapshot(json);
    } catch {
      setError("Analyse IA impossible");
    } finally {
      setRefreshing(false);
    }
  }, [conversationId, refreshing, snapshot]);

  const save = useCallback(
    async (
      instanceId: string | null,
      fieldName: string,
      value: unknown,
      key: string,
    ): Promise<boolean> => {
      setSaveState({ key, status: "saving" });
      try {
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/fields`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              values: { [fieldName]: value },
              ...(instanceId === null ? {} : { ficheInstanceId: instanceId }),
            }),
          },
        );
        const json = (await response.json()) as ConversationFieldsView & { error?: string };
        if (!response.ok) {
          setSaveState({ key, status: "error" });
          toast.error(json.error ?? "Enregistrement impossible");
          return false;
        }
        setSnapshot(json);
        setSaveState({ key, status: "saved" });
        return true;
      } catch {
        setSaveState({ key, status: "error" });
        toast.error("Enregistrement impossible");
        return false;
      }
    },
    [conversationId, toast],
  );

  useEffect(() => {
    void load();
    if (new URLSearchParams(window.location.search).get("panel") === "info") setOpen(true);
    const openFromBanner = (): void => setOpen(true);
    window.addEventListener(OPEN_CONVERSATION_INFO_EVENT, openFromBanner);
    return () => window.removeEventListener(OPEN_CONVERSATION_INFO_EVENT, openFromBanner);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load();
    const timer = window.setInterval(() => void load(), 3_000);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, load]);

  useEffect(() => {
    if (!open || snapshot === null || !snapshot.canEdit || !snapshot.stale || refreshing) return;
    const now = Date.now();
    if (now - lastRefreshAttempt.current < 15_000) return;
    lastRefreshAttempt.current = now;
    void refresh();
  }, [open, snapshot, refreshing, refresh]);

  const fiches = useMemo(() => snapshot?.fiches ?? [], [snapshot]);
  const multi = fiches.length > 0;
  const legacyMandatory = useMemo(
    () => snapshot?.fields.filter((field) => field.requiredNow) ?? [],
    [snapshot],
  );
  const legacyOptional = useMemo(
    () => snapshot?.fields.filter((field) => !field.requiredNow) ?? [],
    [snapshot],
  );
  const requiredTotal = multi
    ? fiches.reduce((sum, fiche) => sum + fiche.requiredTotal, 0)
    : (snapshot?.requiredTotal ?? 0);
  const requiredCollected = multi
    ? fiches.reduce((sum, fiche) => sum + fiche.requiredCollected, 0)
    : (snapshot?.requiredCollected ?? 0);
  const missing = multi
    ? fiches.reduce((sum, fiche) => sum + fiche.requiredMissing, 0)
    : (snapshot?.requiredMissing ?? 0);

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          className="btn ghost small conversation-info-toggle"
          aria-expanded={open}
          aria-controls="conversation-info-panel"
          onClick={() => setOpen((value) => !value)}
        >
          Informations
          {missing > 0 ? <span className="badge orange">{missing}</span> : null}
        </button>
      ) : null}

      {open ? (
        <>
          <button
            type="button"
            className="conversation-info-backdrop"
            aria-label="Fermer les informations"
            onClick={() => setOpen(false)}
          />
          <aside
            id="conversation-info-panel"
            className="conversation-info-panel"
            role="dialog"
            aria-label="Informations à collecter"
          >
            <div className="conversation-info-head">
              <div>
                <span className="eyebrow">Collecte</span>
                <h2>Informations à collecter</h2>
              </div>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            {snapshot !== null ? (
              <>
                <div className="conversation-info-progress">
                  <div className="conversation-info-progress-head">
                    <strong>
                      {requiredCollected}/{requiredTotal} obligatoires
                    </strong>
                    <span className={missing > 0 ? "info-missing" : "info-complete"}>
                      {missing > 0
                        ? `${missing} manquant${missing > 1 ? "s" : ""}`
                        : "Tout est collecté"}
                    </span>
                  </div>
                  <div className="info-progress" aria-hidden>
                    <span
                      style={{
                        width: `${
                          requiredTotal === 0
                            ? 100
                            : Math.round((requiredCollected / requiredTotal) * 100)
                        }%`,
                      }}
                    />
                  </div>
                </div>

                {error !== null ? <p className="alert error">{error}</p> : null}
                {refreshing ? (
                  <p className="hint">Analyse de la conversation par l’IA…</p>
                ) : snapshot.analysis.status === "error" ? (
                  <p className="hint">
                    Dernière analyse impossible : {snapshot.analysis.error ?? "réessayez"}.
                  </p>
                ) : (
                  <p className="hint" suppressHydrationWarning>
                    Dernière analyse :{" "}
                    {mounted ? relativeTime(snapshot.analysis.lastAnalyzedAt) : "—"}
                  </p>
                )}

                <div className="conversation-info-body">
                  {multi ? (
                    fiches.map((fiche) => (
                      <FicheSection
                        key={fiche.instanceId ?? fiche.ficheKey}
                        fiche={fiche}
                        canEdit={snapshot.canEdit}
                        saveState={saveState}
                        onSave={(instanceId, fieldName, value) =>
                          save(
                            instanceId,
                            fieldName,
                            value,
                            `${instanceId ?? fiche.ficheKey}:${fieldName}`,
                          )
                        }
                      />
                    ))
                  ) : (
                    <>
                      {legacyMandatory.length > 0 ? (
                        <section className="info-section">
                          <h3>Obligatoires</h3>
                          {legacyMandatory.map((field) => (
                            <div
                              key={field.name}
                              className={`info-field ${field.missing ? "is-missing" : ""}`}
                            >
                              <div className="info-field-head">
                                <span className="info-field-label">
                                  {field.label}
                                  {field.requiredNow ? (
                                    <span className="required-mark"> *</span>
                                  ) : null}
                                </span>
                                <span className={`info-source ${field.source ?? "empty"}`}>
                                  {field.missing ? "Manquant" : sourceLabel(field.source)}
                                </span>
                              </div>
                              <FieldEditor
                                field={field}
                                fields={snapshot.fields}
                                canEdit={snapshot.canEdit}
                                saving={
                                  saveState?.key === field.name && saveState.status === "saving"
                                }
                                onSave={(fieldName, value) =>
                                  save(null, fieldName, value, fieldName)
                                }
                              />
                              {saveState?.key === field.name && saveState.status === "saved" ? (
                                <span className="info-saved">Enregistré</span>
                              ) : null}
                            </div>
                          ))}
                        </section>
                      ) : null}

                      {legacyOptional.length > 0 ? (
                        <section className="info-section">
                          <h3>Facultatives</h3>
                          {legacyOptional.map((field) => (
                            <div key={field.name} className="info-field">
                              <div className="info-field-head">
                                <span className="info-field-label">{field.label}</span>
                                <span className={`info-source ${field.source ?? "empty"}`}>
                                  {field.missing ? "Non renseigné" : sourceLabel(field.source)}
                                </span>
                              </div>
                              <FieldEditor
                                field={field}
                                fields={snapshot.fields}
                                canEdit={snapshot.canEdit}
                                saving={
                                  saveState?.key === field.name && saveState.status === "saving"
                                }
                                onSave={(fieldName, value) =>
                                  save(null, fieldName, value, fieldName)
                                }
                              />
                            </div>
                          ))}
                        </section>
                      ) : null}

                      {snapshot.fields.length === 0 ? (
                        <p className="hint">
                          Ce chatbot ne déclare aucune information à collecter.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>

                {!snapshot.canEdit ? (
                  <p className="hint">Lecture seule : vous ne pouvez pas modifier les champs.</p>
                ) : (
                  <div className="conversation-info-actions">
                    <button
                      type="button"
                      className="btn ghost small"
                      disabled={refreshing}
                      onClick={() => void refresh()}
                    >
                      {refreshing ? "Analyse…" : "Relancer l’analyse IA"}
                    </button>
                  </div>
                )}
              </>
            ) : error !== null ? (
              <p className="alert error">{error}</p>
            ) : (
              <p className="hint">Chargement des informations…</p>
            )}
          </aside>
        </>
      ) : null}
    </>
  );
}
