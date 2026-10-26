"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import type { WebhookDeliveryDto, WebhookEndpointAdminDto, WebhookTemplateOption } from "./types";
import { WebhookForm } from "./WebhookForm";

function formatDate(value: string | null): string {
  if (value === null) return "—";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function statusBadge(status: WebhookDeliveryDto["status"]): string {
  if (status === "succeeded") return "badge";
  return status === "failed" ? "badge warn" : "badge muted";
}

export function WebhooksPanel({
  initialEndpoints,
  initialDeliveries,
  templates,
}: {
  initialEndpoints: WebhookEndpointAdminDto[];
  initialDeliveries: WebhookDeliveryDto[];
  templates: WebhookTemplateOption[];
}) {
  const [endpoints, setEndpoints] = useState(initialEndpoints);
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WebhookEndpointAdminDto | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);

  async function refreshDeliveries(): Promise<void> {
    const response = await fetch("/api/webhooks/deliveries?limit=50", { cache: "no-store" });
    const json = (await response.json()) as {
      deliveries?: WebhookDeliveryDto[];
      error?: string;
    };
    if (!response.ok || json.deliveries === undefined) {
      setError(json.error ?? "Impossible de recharger les livraisons");
      return;
    }
    setDeliveries(json.deliveries);
  }

  async function removeWebhook(endpoint: WebhookEndpointAdminDto): Promise<void> {
    if (!window.confirm(`Supprimer le webhook « ${endpoint.name} » ?`)) return;
    setError(null);
    try {
      const response = await fetch(`/api/webhooks/${endpoint.id}`, { method: "DELETE" });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Suppression impossible");
        return;
      }
      setEndpoints((previous) => previous.filter((item) => item.id !== endpoint.id));
      toast.success("Webhook supprimé.");
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  }

  async function testWebhook(endpoint: WebhookEndpointAdminDto): Promise<void> {
    if (
      !window.confirm(
        `Envoyer un test réel à « ${endpoint.name} » ?\nUne requête HTTP sera effectuée vers ${endpoint.url}.`,
      )
    ) {
      return;
    }
    setTestingId(endpoint.id);
    setError(null);
    try {
      const response = await fetch(`/api/webhooks/${endpoint.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json()) as {
        responseStatus?: number | null;
        errorMessage?: string | null;
        error?: string;
      };
      if (!response.ok) {
        setError(json.error ?? "Test impossible");
        return;
      }
      if (
        json.responseStatus !== null &&
        json.responseStatus !== undefined &&
        json.responseStatus >= 200 &&
        json.responseStatus < 300
      ) {
        toast.success(`Test réussi (HTTP ${json.responseStatus}).`);
      } else {
        setError(json.errorMessage ?? `Le test a échoué (HTTP ${json.responseStatus ?? "—"}).`);
      }
      await refreshDeliveries();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setTestingId(null);
    }
  }

  async function retryDelivery(delivery: WebhookDeliveryDto): Promise<void> {
    setError(null);
    try {
      const response = await fetch(`/api/webhooks/deliveries/${delivery.id}/retry`, {
        method: "POST",
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Relance impossible");
        return;
      }
      toast.success("Livraison relancée.");
      await refreshDeliveries();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  }

  return (
    <div className="webhooks-admin">
      {error !== null ? <p className="alert error">{error}</p> : null}

      <div className="tools" style={{ marginBottom: "1.25rem" }}>
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          Créer un webhook
        </button>
        <button type="button" className="btn ghost" onClick={() => void refreshDeliveries()}>
          Rafraîchir les livraisons
        </button>
        <span className="muted-text">
          {endpoints.length} webhook{endpoints.length > 1 ? "s" : ""} · les secrets ne sont jamais
          réaffichés
        </span>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Modèle</th>
              <th>Requête</th>
              <th>Auth</th>
              <th>État</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {endpoints.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted-text">
                  Aucun webhook. Créez-en un pour envoyer une fiche vers un service externe.
                </td>
              </tr>
            ) : (
              endpoints.map((endpoint) => (
                <tr key={endpoint.id}>
                  <td>
                    <strong>{endpoint.name}</strong>
                    {endpoint.description !== "" ? (
                      <div className="hint">{endpoint.description}</div>
                    ) : null}
                  </td>
                  <td>
                    <code>{endpoint.templateKey}</code>
                  </td>
                  <td>
                    <div>
                      <span className="badge muted">{endpoint.httpMethod}</span>{" "}
                      <span className="muted-text">{endpoint.url}</span>
                    </div>
                    <div className="hint">{endpoint.bodyMode}</div>
                  </td>
                  <td>{endpoint.auth.type}</td>
                  <td>
                    <span className={`badge ${endpoint.enabled ? "" : "muted"}`}>
                      {endpoint.enabled ? "actif" : "désactivé"}
                    </span>
                  </td>
                  <td>
                    <div className="tools">
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => setEditing(endpoint)}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="btn ghost small"
                        disabled={testingId !== null}
                        onClick={() => void testWebhook(endpoint)}
                      >
                        {testingId === endpoint.id ? "Test…" : "Tester"}
                      </button>
                      <button
                        type="button"
                        className="btn danger ghost small"
                        onClick={() => void removeWebhook(endpoint)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-title" style={{ fontSize: "1.1rem", marginTop: "2.5rem" }}>
        Dernières livraisons
      </h2>
      <div className="table-scroll" style={{ marginTop: "1rem" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Webhook</th>
              <th>Fiche</th>
              <th>Statut</th>
              <th>Tentatives</th>
              <th>Réponse</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {deliveries.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted-text">
                  Aucune livraison.
                </td>
              </tr>
            ) : (
              deliveries.map((delivery) => {
                const endpoint = endpoints.find((item) => item.id === delivery.endpointId);
                return (
                  <tr key={delivery.id}>
                    <td>{formatDate(delivery.createdAt)}</td>
                    <td>{endpoint?.name ?? delivery.endpointId}</td>
                    <td>
                      {delivery.ficheId === null ? (
                        <span className="muted-text">test / échantillon</span>
                      ) : (
                        delivery.ficheId
                      )}
                    </td>
                    <td>
                      <span className={statusBadge(delivery.status)}>{delivery.status}</span>
                    </td>
                    <td>{delivery.attempts}</td>
                    <td>
                      {delivery.responseStatus === null ? (
                        <span className="muted-text">{delivery.errorMessage ?? "—"}</span>
                      ) : (
                        <span>
                          HTTP {delivery.responseStatus}
                          {delivery.errorMessage !== null ? ` · ${delivery.errorMessage}` : ""}
                        </span>
                      )}
                    </td>
                    <td>
                      {delivery.status === "failed" && !delivery.isTest ? (
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => void retryDelivery(delivery)}
                        >
                          Relancer
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {creating || editing !== null ? (
        <Modal
          wide
          title={editing === null ? "Créer un webhook" : "Modifier le webhook"}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        >
          <WebhookForm
            endpoint={editing}
            templates={templates}
            onSaved={(endpoint) => {
              setEndpoints((previous) => {
                const exists = previous.some((item) => item.id === endpoint.id);
                return exists
                  ? previous.map((item) => (item.id === endpoint.id ? endpoint : item))
                  : [endpoint, ...previous];
              });
              setCreating(false);
              setEditing(null);
              toast.success(editing === null ? "Webhook créé." : "Webhook enregistré.");
              void refreshDeliveries();
            }}
            onCancel={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}
