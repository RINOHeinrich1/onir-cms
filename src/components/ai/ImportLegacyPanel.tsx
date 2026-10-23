"use client";

import { useState } from "react";

/** Import explicite de la configuration Infomaniak legacy (jamais automatique). */
export function ImportLegacyPanel({ onImported }: { onImported: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/ai/import-legacy", { method: "POST" });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Import impossible");
        return;
      }
      setNotice("Configuration importée et clé chiffrée.");
      onImported();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="card" style={{ marginBottom: "1.5rem" }}>
      <h2 className="text-title" style={{ fontSize: "1.05rem" }}>
        Configuration legacy détectée
      </h2>
      <p className="hint">
        Les variables AI_API_TOKEN / AI_PRODUCT_ID / AI_MODEL sont présentes dans
        l&apos;environnement. Importez-les pour créer un fournisseur Infomaniak chiffré.
      </p>
      {error !== null ? <p className="alert error">{error}</p> : null}
      {notice !== null ? <p className="alert success">{notice}</p> : null}
      <button type="button" className="btn small" disabled={pending} onClick={() => void run()}>
        {pending ? "Import…" : "Importer la configuration"}
      </button>
    </section>
  );
}
