"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConversationIncidentRecord } from "@/application/ports/conversation-incident-repository";
import { useToast } from "@/components/ui/ToastProvider";
import { OPEN_CONVERSATION_INFO_EVENT } from "./conversation-events";

function isFicheIncident(incident: ConversationIncidentRecord): boolean {
  return incident.kind === "fiche_generation_failed";
}

/**
 * Bannière des erreurs IA/fiche ouvertes sur une conversation (ADR-0046).
 * Elle reste visible jusqu'à résolution explicite par un humain.
 */
export function ConversationIncidentBanner({
  conversationId,
  canIntervene,
}: {
  conversationId: string;
  canIntervene: boolean;
}) {
  const toast = useToast();
  const [incidents, setIncidents] = useState<ConversationIncidentRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/incidents`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const json = (await response.json()) as { incidents?: ConversationIncidentRecord[] };
      setIncidents(json.incidents ?? []);
    } catch {
      // Le prochain tick réessaie.
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const takeOver = async (): Promise<void> => {
    setBusy("takeover");
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/takeover`,
        { method: "POST" },
      );
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        toast.error(json.error ?? "Prise en main impossible");
        return;
      }
      toast.success("Conversation prise en main.");
    } catch {
      toast.error("Prise en main impossible");
    } finally {
      setBusy(null);
    }
  };

  const resolve = async (incidentId: string): Promise<void> => {
    setBusy(incidentId);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/incidents/${encodeURIComponent(incidentId)}/resolve`,
        { method: "POST" },
      );
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        toast.error(json.error ?? "Résolution impossible");
        return;
      }
      setIncidents((current) => current.filter((incident) => incident.id !== incidentId));
      toast.success("Incident marqué comme résolu.");
    } catch {
      toast.error("Résolution impossible");
    } finally {
      setBusy(null);
    }
  };

  if (incidents.length === 0) return null;

  return (
    <section className="conversation-incidents" aria-label="À traiter">
      {incidents.map((incident) => (
        <div key={incident.id} className={`incident-banner ${incident.severity}`}>
          <div className="incident-banner-copy">
            <strong>{incident.title}</strong>
            <p>{incident.detail}</p>
            {incident.occurrences > 1 ? (
              <span className="hint">Survenu {incident.occurrences} fois.</span>
            ) : null}
          </div>
          <div className="incident-banner-actions">
            {isFicheIncident(incident) ? (
              <button
                type="button"
                className="btn small"
                onClick={() => window.dispatchEvent(new Event(OPEN_CONVERSATION_INFO_EVENT))}
              >
                Voir les informations
              </button>
            ) : canIntervene ? (
              <button
                type="button"
                className="btn small"
                disabled={busy !== null}
                onClick={() => void takeOver()}
              >
                {busy === "takeover" ? "Prise en main…" : "Prendre la main"}
              </button>
            ) : null}
            {canIntervene ? (
              <button
                type="button"
                className="btn ghost small"
                disabled={busy !== null}
                onClick={() => void resolve(incident.id)}
              >
                {busy === incident.id ? "Résolution…" : "Marquer résolu"}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
