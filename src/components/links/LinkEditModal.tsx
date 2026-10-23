"use client";

import { useEffect, useRef, useState } from "react";
import { CategoryPicker } from "@/components/categories/CategoryPicker";
import type { ChatLinkSources } from "@/domain/entities/chat";
import type { TemplateParamValues } from "@/domain/template-params";
import { orphanParamKeys } from "@/domain/template-params";
import { AiAssignmentField, type LinkAiValue } from "./AiAssignmentField";
import { LinkDataBindingsField } from "./LinkDataBindingsField";
import { SourcesField } from "./SourcesField";
import { TemplateParamsFields } from "./TemplateParamsFields";
import type {
  AiProviderOption,
  ChatLinkRow,
  ConfidentialiteOption,
  VisualTemplateOption,
} from "./types";
import { UserStateField } from "./UserStateField";
import {
  defaultsForSchema,
  paramsSchemaForSelection,
  parseVisualTemplateSelection,
} from "./visual-template-selection";

/**
 * Modale d'édition globale d'un lien : libellé + expiration (US-LIENS-001).
 * Date vide = sans expiration ; mêmes règles que la création.
 */
export function LinkEditModal({
  link,
  confidentialites,
  visualTemplates,
  aiProviders,
  canAssignAi,
  onSaved,
  onClose,
}: {
  link: ChatLinkRow;
  confidentialites: ConfidentialiteOption[];
  visualTemplates: VisualTemplateOption[];
  aiProviders: AiProviderOption[];
  canAssignAi: boolean;
  onSaved: (updated: ChatLinkRow) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(link.label);
  const [expiresAt, setExpiresAt] = useState(
    link.expiresAt === null ? "" : link.expiresAt.slice(0, 10),
  );
  const [sources, setSources] = useState<ChatLinkSources>({ ...link.sources });
  const [userStateEnabled, setUserStateEnabled] = useState<boolean>(link.userStateEnabled);
  const [confidentialiteId, setConfidentialiteId] = useState<string>(link.confidentialiteId ?? "");
  const [visualTemplate, setVisualTemplate] = useState<string>(
    link.visualTemplateId !== null
      ? `${link.visualTemplateId}@${link.visualTemplateVersion ?? ""}`
      : "",
  );
  const [params, setParams] = useState<TemplateParamValues>({ ...link.visualTemplateParams });
  const [dataBindings, setDataBindings] = useState<Record<string, string>>({});
  const [dataBindingsLoaded, setDataBindingsLoaded] = useState(false);
  const [ai, setAi] = useState<LinkAiValue>({
    aiProviderId: link.aiProviderId,
    aiModel: link.aiModel,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const paramsSchema = paramsSchemaForSelection(visualTemplates, visualTemplate);
  const orphans = orphanParamKeys(paramsSchema, params);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/links/${link.id}/data-bindings`)
      .then(async (response) =>
        response.ok ? ((await response.json()) as { dataBindings?: Record<string, string> }) : null,
      )
      .then((json) => {
        if (!cancelled && json?.dataBindings !== undefined) {
          setDataBindings(json.dataBindings);
          setDataBindingsLoaded(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [link.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          expiresAt,
          sources,
          confidentialiteId,
          userStateEnabled,
          aiProviderId: ai.aiProviderId,
          aiModel: ai.aiModel,
          ...(() => {
            const parsed = parseVisualTemplateSelection(visualTemplate);
            return {
              visualTemplateId: parsed.id,
              visualTemplateVersion: parsed.version,
              visualTemplateParams: params,
              ...(dataBindingsLoaded ? { dataBindings } : {}),
            };
          })(),
        }),
      });
      const json = (await response.json()) as { link?: ChatLinkRow; error?: string };
      if (!response.ok || json.link === undefined) {
        setError(json.error ?? "Modification impossible");
        return;
      }
      onSaved(json.link);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="modal-overlay">
      <button type="button" className="modal-backdrop" aria-label="Fermer" onClick={onClose} />
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Modifier le lien"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="modal-head">
          <h3>Modifier le lien</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          <form className="form" onSubmit={onSubmit} noValidate>
            {error !== null ? <p className="alert error">{error}</p> : null}

            <p className="hint">
              Type : <span className="badge">{link.type}</span> — non modifiable.
            </p>

            <label className="field">
              Libellé (optionnel)
              <input
                type="text"
                placeholder="Ex. Salon IT, Stand, Campagne"
                maxLength={120}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>

            <CategoryPicker contentType="link" contentId={link.id} />

            <SourcesField value={sources} onChange={setSources} />

            <UserStateField value={userStateEnabled} onChange={setUserStateEnabled} />

            <label className="field">
              Confidentialité
              <select
                value={confidentialiteId}
                onChange={(event) => setConfidentialiteId(event.target.value)}
              >
                <option value="">— Aucune —</option>
                {confidentialites.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.titre}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Template visuel
              <select
                value={visualTemplate}
                onChange={(event) => {
                  setVisualTemplate(event.target.value);
                  setParams(
                    defaultsForSchema(
                      paramsSchemaForSelection(visualTemplates, event.target.value),
                    ),
                  );
                  setDataBindings({});
                  setDataBindingsLoaded(true);
                }}
              >
                <option value="">— Défaut —</option>
                {visualTemplates.flatMap((item) =>
                  item.versions.map((entry) => (
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
                Changer de template réinitialise ses paramètres aux valeurs par défaut.
              </span>
            </label>

            <LinkDataBindingsField
              templateId={parseVisualTemplateSelection(visualTemplate).id}
              templateVersion={parseVisualTemplateSelection(visualTemplate).version}
              value={dataBindings}
              onChange={setDataBindings}
            />

            <AiAssignmentField
              providers={aiProviders}
              value={ai}
              onChange={setAi}
              canAssign={canAssignAi}
            />

            <TemplateParamsFields
              schema={paramsSchema}
              values={params}
              onChange={setParams}
              orphans={orphans}
              onRemoveOrphan={(key) => {
                const next = { ...params };
                delete next[key];
                setParams(next);
              }}
            />

            <label className="field">
              Expiration (vide = sans expiration)
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <span className="hint">Le lien reste valide jusqu&apos;à la fin du jour choisi.</span>
            </label>

            <div className="tools">
              <button type="submit" className="btn small" disabled={pending}>
                {pending ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button type="button" className="btn ghost small" onClick={onClose}>
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
