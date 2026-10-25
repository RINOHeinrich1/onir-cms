"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import {
  AI_PROVIDER_PRESET_LABELS,
  AI_PROVIDER_PRESETS,
  type AiProviderPreset,
  presetBaseUrl,
} from "@/domain/entities/ai-provider";
import type { AiProviderDto } from "./types";

/** Formulaire de création/édition d'un fournisseur (clé jamais réaffichée). */
export function AiProviderForm({
  provider,
  onSaved,
  onCancel,
}: {
  provider?: AiProviderDto;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(provider?.label ?? "");
  const [preset, setPreset] = useState<AiProviderPreset>(provider?.preset ?? "openai");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? presetBaseUrl("openai"));
  const [productId, setProductId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);

  const changePreset = (next: AiProviderPreset): void => {
    setPreset(next);
    const nextBase = presetBaseUrl(next, productId);
    if (nextBase !== "") setBaseUrl(nextBase);
    if (next === "infomaniak") setBaseUrl(presetBaseUrl("infomaniak", productId));
  };

  const changeProductId = (value: string): void => {
    setProductId(value);
    if (preset === "infomaniak") setBaseUrl(presetBaseUrl("infomaniak", value));
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        provider === undefined ? "/api/ai/providers" : `/api/ai/providers/${provider.id}`,
        {
          method: provider === undefined ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label,
            preset,
            baseUrl,
            ...(preset === "infomaniak" && productId.trim() !== "" ? { productId } : {}),
            ...(apiKey.trim() === "" ? {} : { apiKey }),
          }),
        },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      toast.success("Fournisseur enregistré.");
      onSaved();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="card" style={{ marginBottom: "1.5rem" }}>
      <div className="page-head" style={{ marginBottom: "1rem" }}>
        <h2 className="text-title" style={{ fontSize: "1.05rem" }}>
          {provider === undefined ? "Ajouter un fournisseur" : "Modifier le fournisseur"}
        </h2>
      </div>
      <form className="form" onSubmit={onSubmit} noValidate>
        {error !== null ? <p className="alert error">{error}</p> : null}

        <label className="field">
          Nom
          <input
            type="text"
            required
            maxLength={120}
            value={label}
            placeholder="Ex. OpenAI production"
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>

        <label className="field">
          Type de fournisseur
          <select
            value={preset}
            onChange={(event) => changePreset(event.target.value as AiProviderPreset)}
          >
            {AI_PROVIDER_PRESETS.map((value) => (
              <option key={value} value={value}>
                {AI_PROVIDER_PRESET_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        {preset === "infomaniak" ? (
          <label className="field">
            Product ID Infomaniak
            <input
              type="text"
              value={productId}
              placeholder="Identifiant produit"
              onChange={(event) => changeProductId(event.target.value)}
            />
            <span className="hint">
              L&apos;URL est construite automatiquement ; elle reste modifiable ci-dessous.
            </span>
          </label>
        ) : null}

        <label className="field">
          URL de base
          <input
            type="url"
            required
            value={baseUrl}
            placeholder="https://api.example.com/v1"
            onChange={(event) => setBaseUrl(event.target.value)}
          />
          <span className="hint">
            L&apos;URL doit pointer vers la racine OpenAI-compatible, sans /chat/completions.
          </span>
        </label>

        <label className="field">
          Clé API {provider === undefined ? "" : "(laisser vide pour conserver)"}
          <input
            type="password"
            autoComplete="new-password"
            value={apiKey}
            placeholder={provider === undefined ? "sk-…" : `${provider.apiKeyHint} (inchangée)`}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <span className="hint">
            La clé est chiffrée avec AI_PROVIDER_KEY et n&apos;est jamais réaffichée.
          </span>
        </label>

        <div className="tools">
          <button type="submit" className="btn small" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" className="btn ghost small" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </form>
    </section>
  );
}
