"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";

type PublicEndpoint = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
};

type Preview = {
  endpoint: PublicEndpoint;
  snapshot: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    bodyPreview: string;
    bodyBytes: number;
    attachmentCount: number;
  };
};

type Delivery = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  responseStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
};

function statusLabel(status: Delivery["status"]): string {
  if (status === "queued") return "en attente";
  if (status === "running") return "en cours";
  if (status === "succeeded") return "envoyé";
  return "échec";
}

export function FicheWebhookActions({
  ficheId,
  endpoints,
}: {
  ficheId: string;
  endpoints: PublicEndpoint[];
}) {
  const [open, setOpen] = useState(false);
  const [endpointId, setEndpointId] = useState(endpoints[0]?.id ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);

  const endpoint = endpoints.find((item) => item.id === endpointId) ?? null;

  useEffect(() => {
    if (delivery === null || (delivery.status !== "queued" && delivery.status !== "running")) {
      return;
    }
    let cancelled = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/webhooks/deliveries/${delivery.id}`, {
            cache: "no-store",
          });
          const json = (await response.json()) as { delivery?: Delivery };
          if (!cancelled && response.ok && json.delivery !== undefined) {
            setDelivery(json.delivery);
            if (json.delivery.status === "succeeded") toast.success("Webhook envoyé.");
            if (json.delivery.status === "failed") {
              setError(json.delivery.errorMessage ?? "Le webhook a échoué.");
            }
          }
        } catch {
          // Le prochain tick réessaiera ; l'utilisateur voit le dernier statut connu.
        }
      })();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [delivery, toast]);

  async function loadPreview(): Promise<void> {
    if (endpoint === null) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/fiches/${ficheId}/webhooks/${endpoint.id}/preview`, {
        method: "POST",
      });
      const json = (await response.json()) as Preview & { error?: string };
      if (!response.ok || json.snapshot === undefined) {
        setError(json.error ?? "Aperçu impossible");
        return;
      }
      setPreview(json);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  }

  async function trigger(): Promise<void> {
    if (endpoint === null) return;
    setPending(true);
    setError(null);
    setDelivery(null);
    try {
      const response = await fetch(`/api/fiches/${ficheId}/webhooks/${endpoint.id}/trigger`, {
        method: "POST",
      });
      const json = (await response.json()) as { delivery?: Delivery; error?: string };
      if (!response.ok || json.delivery === undefined) {
        setError(json.error ?? "Déclenchement impossible");
        return;
      }
      setDelivery(json.delivery);
      toast.success("Livraison créée, envoi en cours.");
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  }

  if (endpoints.length === 0) return null;

  return (
    <>
      <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
        Envoyer via webhook
      </button>

      {open ? (
        <Modal
          title="Envoyer via webhook"
          onClose={() => {
            setOpen(false);
            setPreview(null);
            setDelivery(null);
            setError(null);
          }}
        >
          {error !== null ? <p className="alert error">{error}</p> : null}
          <label className="field">
            Webhook
            <select
              value={endpointId}
              onChange={(event) => {
                setEndpointId(event.target.value);
                setPreview(null);
                setDelivery(null);
              }}
            >
              {endpoints.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {endpoint?.description !== "" ? <p className="hint">{endpoint?.description}</p> : null}

          <div className="tools">
            <button
              type="button"
              className="btn ghost small"
              disabled={pending || endpoint === null}
              onClick={() => void loadPreview()}
            >
              {pending ? "Chargement…" : "Aperçu du payload"}
            </button>
            <button
              type="button"
              className="btn small"
              disabled={
                pending ||
                endpoint === null ||
                delivery?.status === "queued" ||
                delivery?.status === "running"
              }
              onClick={() => void trigger()}
            >
              Envoyer
            </button>
          </div>

          {preview !== null ? (
            <div className="card" style={{ marginTop: "1rem" }}>
              <p className="hint">
                {preview.snapshot.method} {preview.snapshot.url}
                <br />
                {preview.snapshot.bodyBytes} octet(s), {preview.snapshot.attachmentCount} pièce(s)
              </p>
              {preview.snapshot.headers.length > 0 ? (
                <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {preview.snapshot.headers
                    .map((header) => `${header.name}: ${header.value}`)
                    .join("\n")}
                </pre>
              ) : null}
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {preview.snapshot.bodyPreview}
              </pre>
            </div>
          ) : null}

          {delivery !== null ? (
            <p className={`alert ${delivery.status === "failed" ? "error" : "warn"}`}>
              Statut : <strong>{statusLabel(delivery.status)}</strong>
              {delivery.responseStatus !== null ? ` · HTTP ${delivery.responseStatus}` : ""}
              {delivery.errorMessage !== null ? ` · ${delivery.errorMessage}` : ""}
            </p>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
