"use client";

import { useEffect, useState } from "react";

/** Sélection parmi les modèles ACTIFS enregistrés pour un fournisseur. */
export function AiModelSelect({
  providerId,
  value,
  onChange,
  disabled = false,
}: {
  providerId: string | null;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (providerId === null || providerId === "") {
      setModels([]);
      setNote("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNote("");
    void fetch(`/api/ai/providers/${providerId}/models?enabled=1`)
      .then(async (response) => {
        const json = (await response.json()) as {
          models?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setModels([]);
          setNote(json.error ?? "Catalogue indisponible.");
          return;
        }
        setModels(json.models ?? []);
        if ((json.models ?? []).length === 0) {
          setNote("Aucun modèle actif : gérez les modèles du fournisseur.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setModels([]);
          setNote("Catalogue indisponible.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  return (
    <div>
      <select
        value={value}
        disabled={disabled || loading || models.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">— Choisir un modèle —</option>
        {models.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
      {loading ? <span className="hint">Chargement des modèles…</span> : null}
      {!loading && note !== "" ? <span className="hint">{note}</span> : null}
    </div>
  );
}
