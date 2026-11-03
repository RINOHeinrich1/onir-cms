"use client";

import { type FormEvent, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";

/**
 * Seuil d'alerte d'expiration des chatbots, global à l'organisation.
 * La date d'expiration elle-même reste configurée chatbot par chatbot.
 */
export function ExpirationAlertSettings({
  initialDays,
  organizationName,
}: {
  initialDays: number;
  organizationName: string;
}) {
  const toast = useToast();
  const [days, setDays] = useState(String(initialDays));
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const value = Number(days);
    if (!Number.isInteger(value) || value < 0 || value > 365) {
      toast.error("Le seuil doit être un entier entre 0 et 365 jours.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/configuration/expiration-alert", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: value }),
      });
      const json = (await response.json()) as { expirationAlertDays?: number; error?: string };
      if (!response.ok || typeof json.expirationAlertDays !== "number") {
        throw new Error(json.error ?? "Enregistrement impossible");
      }
      setDays(String(json.expirationAlertDays));
      toast.success("Seuil d’alerte mis à jour.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <h2 className="text-title" style={{ fontSize: "1.05rem" }}>
        Seuil d’alerte d’expiration
      </h2>
      <p className="hint">
        Pour <strong>{organizationName}</strong>, les chatbots actifs dont l’expiration arrive dans
        ce délai sont comptés dans « Vue globale ». L’expiration reste réglée sur chaque chatbot.
      </p>
      <form className="form" onSubmit={(event) => void save(event)}>
        <label className="field">
          Seuil d’alerte (jours)
          <input
            type="number"
            min={0}
            max={365}
            step={1}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
          <span className="hint">
            0 désactive l’alerte. Exemple : 5 signale les chatbots à 5 jours ou moins.
          </span>
        </label>
        <div className="actions">
          <button className="btn small" type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </section>
  );
}
