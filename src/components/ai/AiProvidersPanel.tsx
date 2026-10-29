"use client";

import { useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { AI_PROVIDER_PRESET_LABELS } from "@/domain/entities/ai-provider";
import { AiClustersPanel } from "./AiClustersPanel";
import { AiModelsPanel } from "./AiModelsPanel";
import { AiProviderForm } from "./AiProviderForm";
import { AiUsageDefaults } from "./AiUsageDefaults";
import { ImportLegacyPanel } from "./ImportLegacyPanel";
import type { AiProviderDto } from "./types";

function testLabel(provider: AiProviderDto): string {
  if (provider.lastTestOk === true) return "Connecté";
  if (provider.lastTestOk === false) return "Erreur";
  return "Non testé";
}

/** Gestion des fournisseurs IA et du défaut d'organisation. */
export function AiProvidersPanel({
  initialProviders,
  canManage,
  legacyAvailable,
}: {
  initialProviders: AiProviderDto[];
  canManage: boolean;
  legacyAvailable: boolean;
}) {
  const [providers, setProviders] = useState(initialProviders);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<AiProviderDto | null>(null);
  const [managingModels, setManagingModels] = useState<AiProviderDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"defaults" | "clusters" | "providers">("defaults");
  useToastOnMessage(error, notice);

  const reload = async (): Promise<void> => {
    const providersResponse = await fetch("/api/ai/providers?includeArchived=1");
    if (providersResponse.ok) {
      const json = (await providersResponse.json()) as { providers?: AiProviderDto[] };
      if (json.providers !== undefined) setProviders(json.providers);
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
    if (!(await confirmDialog(`Archiver le fournisseur « ${provider.label} » ?`))) return;
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

      <nav className="subtabs" aria-label="Sections des paramètres IA">
        <button
          type="button"
          className={`subtab ${tab === "defaults" ? "active" : ""}`}
          aria-pressed={tab === "defaults"}
          onClick={() => setTab("defaults")}
        >
          Défauts par usage
        </button>
        <button
          type="button"
          className={`subtab ${tab === "clusters" ? "active" : ""}`}
          aria-pressed={tab === "clusters"}
          onClick={() => setTab("clusters")}
        >
          Clusters
        </button>
        <button
          type="button"
          className={`subtab ${tab === "providers" ? "active" : ""}`}
          aria-pressed={tab === "providers"}
          onClick={() => setTab("providers")}
        >
          Fournisseurs ({activeProviders.length})
        </button>
      </nav>

      {tab === "defaults" ? (
        <AiUsageDefaults
          providers={activeProviders}
          canManage={canManage}
          onSaved={() => void reload()}
        />
      ) : null}

      {tab === "clusters" ? (
        <AiClustersPanel providers={activeProviders} canManage={canManage} />
      ) : null}

      {tab === "providers" ? (
        <>
          {legacyAvailable && canManage ? (
            <ImportLegacyPanel onImported={() => void reload()} />
          ) : null}

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
        </>
      ) : null}

      {managingModels !== null ? (
        <AiModelsPanel provider={managingModels} onClose={() => setManagingModels(null)} />
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

      {tab === "providers" ? (
        <div className="table-scroll">
          <table className="table table-cards">
            <thead>
              <tr>
                <th>Fournisseur</th>
                <th>Type</th>
                <th>URL</th>
                <th>Clé</th>
                <th>Test</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => {
                const archived = provider.archivedAt !== null;
                return (
                  <tr key={provider.id}>
                    <td data-label="Fournisseur">
                      <strong>{provider.label}</strong>
                      {archived ? (
                        <span className="badge orange" style={{ marginLeft: "0.5rem" }}>
                          archivé
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Type">{AI_PROVIDER_PRESET_LABELS[provider.preset]}</td>
                    <td data-label="URL">
                      <span className="hint">{provider.baseUrl}</span>
                    </td>
                    <td data-label="Clé">{provider.apiKeyHint}</td>
                    <td data-label="Test">
                      <span className={`badge ${provider.lastTestOk === false ? "orange" : ""}`}>
                        {testLabel(provider)}
                      </span>
                      {provider.lastTestError !== "" ? (
                        <div className="hint">{provider.lastTestError}</div>
                      ) : null}
                    </td>
                    <td data-label="Actions" className="cell-actions">
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
                  <td colSpan={6}>
                    Aucun fournisseur configuré. Les liens utilisent la configuration legacy.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
