"use client";

import { useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { AiModelSelect } from "./AiModelSelect";
import type { AiProviderDto, AiSettingsDto } from "./types";

type TestResult = {
  ok: boolean;
  latencyMs?: number;
  preview?: string;
  error?: string;
};

/** Modèle dédié à l'extraction structurée et son secours (ADR-0047). */
export function AiExtractionSettings({
  providers,
  settings,
  canManage,
  onSaved,
}: {
  providers: AiProviderDto[];
  settings: AiSettingsDto | null;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [providerId, setProviderId] = useState(settings?.extractionProviderId ?? "");
  const [model, setModel] = useState(settings?.extractionModel ?? "");
  const [fallbackProviderId, setFallbackProviderId] = useState(
    settings?.extractionFallbackProviderId ?? "",
  );
  const [fallbackModel, setFallbackModel] = useState(settings?.extractionFallbackModel ?? "");
  const [pending, setPending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useToastOnMessage(error, notice);

  const save = async (): Promise<void> => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/ai/settings/extraction", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          model,
          fallbackProviderId,
          fallbackModel,
        }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      setNotice("Moteur d'extraction enregistré.");
      onSaved();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const runTest = async (): Promise<void> => {
    if (providerId === "" || model === "") return;
    setTesting(true);
    setTest(null);
    try {
      const response = await fetch("/api/ai/extraction/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, model }),
      });
      const json = (await response.json()) as TestResult & { error?: string };
      setTest(
        response.ok ? json : { ok: false, error: json.error ?? "Test d'extraction impossible" },
      );
    } catch {
      setTest({ ok: false, error: "Erreur réseau" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="card" style={{ marginBottom: "1.5rem" }}>
      <h2 className="text-title" style={{ fontSize: "1.05rem" }}>
        Moteur d&apos;extraction
      </h2>
      <p className="hint">
        Utilisé pour les champs de conversation, les fiches et les classifications. Il est séparé du
        modèle de chat et bascule sur le secours en cas d’échec JSON.
      </p>
      {error !== null ? <p className="alert error">{error}</p> : null}
      {notice !== null ? <p className="alert success">{notice}</p> : null}

      <div className="grid-2">
        <label className="field">
          Fournisseur d’extraction
          <select
            value={providerId}
            disabled={!canManage || pending}
            onChange={(event) => {
              setProviderId(event.target.value);
              setModel("");
              setTest(null);
              if (event.target.value === "") {
                setFallbackProviderId("");
                setFallbackModel("");
              }
            }}
          >
            <option value="">— Utiliser le modèle du lien —</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Modèle d’extraction</span>
          <AiModelSelect
            providerId={providerId === "" ? null : providerId}
            value={model}
            onChange={setModel}
            disabled={!canManage || pending || providerId === ""}
          />
        </div>
        <label className="field">
          Fournisseur de secours
          <select
            value={fallbackProviderId}
            disabled={!canManage || pending}
            onChange={(event) => {
              setFallbackProviderId(event.target.value);
              setFallbackModel("");
            }}
          >
            <option value="">— Aucun secours —</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Modèle de secours</span>
          <AiModelSelect
            providerId={fallbackProviderId === "" ? null : fallbackProviderId}
            value={fallbackModel}
            onChange={setFallbackModel}
            disabled={!canManage || pending || fallbackProviderId === ""}
          />
        </div>
      </div>

      {test !== null ? (
        <p className={test.ok ? "alert success" : "alert error"}>
          {test.ok
            ? `Extraction valide · ${test.latencyMs ?? 0} ms · ${test.preview ?? ""}`
            : `Extraction en échec : ${test.error ?? "réponse non structurée"}`}
        </p>
      ) : null}

      {canManage ? (
        <div className="tools">
          <button
            type="button"
            className="btn small"
            disabled={pending || (providerId !== "" && model === "")}
            onClick={() => void save()}
          >
            Enregistrer le moteur
          </button>
          <button
            type="button"
            className="btn ghost small"
            disabled={testing || providerId === "" || model === ""}
            onClick={() => void runTest()}
          >
            {testing ? "Test…" : "Tester l’extraction"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
