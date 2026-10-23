"use client";

import { useEffect, useState } from "react";
import type { TemplateDataContract } from "@/domain/data-contracts";
import type { TemplateDataBinding } from "@/domain/template-data";

type Props = {
  templateId: string | null;
  templateVersion: string | null;
  /** `{ contractKey: bindingId }` — uniquement les surcharges du lien. */
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
};

/**
 * Choix, par contrat exposé par le template, de la source de données du lien.
 * « Défaut » = binding par défaut de la version ; sinon une variante.
 */
export function LinkDataBindingsField({ templateId, templateVersion, value, onChange }: Props) {
  const [contracts, setContracts] = useState<TemplateDataContract[]>([]);
  const [bindings, setBindings] = useState<TemplateDataBinding[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (templateId === null || templateVersion === null) {
      setContracts([]);
      setBindings([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetch(
      `/api/visual-templates/${templateId}/data-bindings?version=${encodeURIComponent(templateVersion)}`,
    )
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          contracts?: TemplateDataContract[];
          bindings?: TemplateDataBinding[];
        };
      })
      .then((json) => {
        if (cancelled || json === null) return;
        setContracts(json.contracts ?? []);
        setBindings(json.bindings ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId, templateVersion]);

  if (templateId === null || templateVersion === null) return null;

  if (loading) {
    return <p className="hint">Chargement des sources de données…</p>;
  }
  if (contracts.length === 0) {
    return <p className="hint">Ce template ne déclare aucune ressource de données.</p>;
  }

  return (
    <div>
      <h3 className="text-title" style={{ fontSize: "0.95rem", margin: "0 0 0.25rem" }}>
        Sources de données
      </h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Par défaut, chaque contrat utilise la source définie sur la version du template. Choisissez
        ici une variante propre à ce lien.
      </p>
      {contracts.map((contract) => {
        const options = bindings.filter((binding) => binding.contractKey === contract.key);
        const selected = value[contract.key] ?? "";
        return (
          <label className="field" key={contract.key}>
            {contract.label} <span className="muted-text">({contract.key})</span>
            <select
              className="input"
              value={selected}
              onChange={(event) => {
                const next = { ...value };
                if (event.target.value === "") delete next[contract.key];
                else next[contract.key] = event.target.value;
                onChange(next);
              }}
            >
              <option value="">Défaut (configuration du template)</option>
              {options.map((binding) => (
                <option key={binding.id} value={binding.id} disabled={!binding.enabled}>
                  {binding.isDefault ? "Défaut" : "Variante"} — {binding.name}
                  {binding.enabled ? "" : " (désactivée)"}
                </option>
              ))}
            </select>
            {options.length === 0 ? (
              <span className="hint">Aucune source configurée pour ce contrat.</span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
