"use client";

import { useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { AI_PROVIDER_PRESET_LABELS } from "@/domain/entities/ai-provider";
import { AiDefaultSettings } from "./AiDefaultSettings";
import { AiExtractionSettings } from "./AiExtractionSettings";
import { AiModelsPanel } from "./AiModelsPanel";
import { AiProviderForm } from "./AiProviderForm";
import { ImportLegacyPanel } from "./ImportLegacyPanel";
import type { AiProviderDto, AiSettingsDto } from "./types";

function testLabel(provider: AiProviderDto): string {
  if (provider.lastTestOk === true) return "Connecté";
  if (provider.lastTestOk === false) return "Erreur";
  return "Non testé";
}

/** Gestion des fournisseurs IA et du défaut d'organisation. */
export function AiProvidersPanel({
  initialProviders,
  initialSettings,
  canManage,
  legacyAvailable,
}: {
  initialProviders: AiProviderDto[];
  initialSettings: AiSettingsDto | null;
  canManage: boolean;
  legacyAvailable: boolean;
}) {
  const [providers, setProviders] = useState(initialProviders);
  const [settings, setSettings] = useState(initialSettings);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<AiProviderDto | null>(null);
  const [managingModels, setManagingModels] = useState<AiProviderDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useToastOnMessage(error, notice);

  const reload = async (): Promise<void> => {
    const [providersResponse, settingsResponse] = await Promise.all([
      fetch("/api/ai/providers?includeArchived=1"),
      fetch("/api/ai/settings"),
    ]);
    if (providersResponse.ok) {
      const json = (await providersResponse.json()) as { providers?: AiProviderDto[] };
      if (json.providers !== undefined) setProviders(json.providers);
    }
    if (settingsResponse.ok) {
      const json = (await settingsResponse.json()) as { settings?: AiSettingsDto | null };
      setSettings(json.settings ?? null);
    }
  };

  const test = async (provider: AiProviderDto): Promise<void> => {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/ai/providers/${provider.id}/test`, { method: "POST" });
      const json = (await response.json()) as {
        ok?: boolean;
        latencyMs?: number;
        modelsCount?: number;
        error?: string;
      };
      if (!response.ok) {
        setError(json.error ?? "Test impossible");
        return;
      }
      setNotice(
        json.ok === true
          ? `Connexion réussie (${json.latencyMs ?? 0} ms, ${json.modelsCount ?? 0} modèles).`
          : `Test en échec : ${json.error ?? "fournisseur indisponible"}`,
      );
      await reload();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  const archive = async (provider: AiProviderDto): Promise<void> => {
    if (!window.confirm(`Archiver le fournisseur « ${provider.label} » ?`)) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/ai/providers/${provider.id}`, { method: "DELETE" });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Archivage impossible");
        return;
      }
      setNotice("Fournisseur archivé.");
      await reload();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  const activeProviders = providers.filter((provider) => provider.archivedAt === null);

  return (
    <div>
      {error !== null ? <p className="alert error">{error}</p> : null}
      {notice !== null ? <p className="alert success">{notice}</p> : null}

      <AiDefaultSettings
        key={`${settings?.defaultProviderId ?? "none"}:${settings?.defaultModel ?? "none"}`}
        providers={activeProviders}
        settings={settings}
        canManage={canManage}
        onSaved={() => void reload()}
      />

      <AiExtractionSettings
        key={`${settings?.extractionProviderId ?? "none"}:${settings?.extractionModel ?? "none"}:${settings?.extractionFallbackProviderId ?? "none"}`}
        providers={activeProviders}
        settings={settings}
        canManage={canManage}
        onSaved={() => void reload()}
      />

      {legacyAvailable && canManage ? <ImportLegacyPanel onImported={() => void reload()} /> : null}

      {canManage ? (
        <div className="tools" style={{ marginBottom: "1rem" }}>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setEditing(null);
              setFormMode("create");
            }}
          >
            Ajouter un fournisseur
          </button>
        </div>
      ) : null}

      {managingModels !== null ? (
        <AiModelsPanel
          provider={managingModels}
          onChanged={() => void reload()}
          onClose={() => setManagingModels(null)}
        />
      ) : null}

      {formMode !== null ? (
        <AiProviderForm
          key={editing?.id ?? "new"}
          {...(editing === null ? {} : { provider: editing })}
          onSaved={() => {
            setFormMode(null);
            setEditing(null);
            void reload();
          }}
          onCancel={() => {
            setFormMode(null);
            setEditing(null);
          }}
        />
      ) : null}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Fournisseur</th>
              <th>Type</th>
              <th>URL</th>
              <th>Clé</th>
              <th>Modèle par défaut</th>
              <th>Test</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => {
              const archived = provider.archivedAt !== null;
              const isDefault = settings?.defaultProviderId === provider.id;
              return (
                <tr key={provider.id}>
                  <td>
                    <strong>{provider.label}</strong>
                    {isDefault ? (
                      <span className="badge" style={{ marginLeft: "0.5rem" }}>
                        défaut
                      </span>
                    ) : null}
                    {archived ? (
                      <span className="badge orange" style={{ marginLeft: "0.5rem" }}>
                        archivé
                      </span>
                    ) : null}
                  </td>
                  <td>{AI_PROVIDER_PRESET_LABELS[provider.preset]}</td>
                  <td>
                    <span className="hint">{provider.baseUrl}</span>
                  </td>
                  <td>{provider.apiKeyHint}</td>
                  <td>{provider.defaultModel ?? <span className="hint">—</span>}</td>
                  <td>
                    <span className={`badge ${provider.lastTestOk === false ? "orange" : ""}`}>
                      {testLabel(provider)}
                    </span>
                    {provider.lastTestError !== "" ? (
                      <div className="hint">{provider.lastTestError}</div>
                    ) : null}
                  </td>
                  <td>
                    {canManage && !archived ? (
                      <div className="tools">
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => void test(provider)}
                        >
                          Tester
                        </button>
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => setManagingModels(provider)}
                        >
                          Modèles
                        </button>
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => {
                            setEditing(provider);
                            setFormMode("edit");
                          }}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="btn danger ghost small"
                          onClick={() => void archive(provider)}
                        >
                          Archiver
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {providers.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  Aucun fournisseur configuré. Les liens utilisent la configuration legacy.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
