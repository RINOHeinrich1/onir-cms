"use client";

import { useMemo, useState } from "react";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import { type ApiKey, apiKeyStatus } from "@/domain/entities/api-key";

type CreatedKey = { key: ApiKey; secret: string };

function formatDate(value: string | null): string {
  if (value === null) return "—";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function statusLabel(key: ApiKey): string {
  const status = apiKeyStatus(key);
  if (status === "revoked") return "révoquée";
  if (status === "expired") return "expirée";
  return "active";
}

export function ApiKeysPanel({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);

  const activeCount = useMemo(
    () => keys.filter((key) => apiKeyStatus(key) === "active").length,
    [keys],
  );

  async function createKey(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          expiresInDays: expiresInDays === "never" ? null : Number(expiresInDays),
        }),
      });
      const json = (await response.json()) as CreatedKey & { error?: string };
      if (!response.ok || json.key === undefined || json.secret === undefined) {
        setError(json.error ?? "Création impossible");
        return;
      }
      setKeys((previous) => [json.key, ...previous]);
      setCreated({ key: json.key, secret: json.secret });
      setCreating(false);
      setName("");
      setExpiresInDays("90");
      setCopied(false);
      toast.success("Clé API créée.");
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  }

  async function revokeKey(key: ApiKey): Promise<void> {
    if (!window.confirm(`Révoquer définitivement la clé « ${key.name} » ?`)) return;
    setError(null);
    try {
      const response = await fetch(`/api/api-keys/${key.id}`, { method: "DELETE" });
      const json = (await response.json()) as { apiKey?: ApiKey; error?: string };
      const revoked = json.apiKey;
      if (!response.ok || revoked === undefined) {
        setError(json.error ?? "Révocation impossible");
        return;
      }
      setKeys((previous) => previous.map((item) => (item.id === key.id ? revoked : item)));
      toast.success("Clé API révoquée.");
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  }

  async function copySecret(): Promise<void> {
    if (created === null) return;
    try {
      await navigator.clipboard.writeText(created.secret);
      setCopied(true);
      toast.success("Clé copiée.");
    } catch {
      setError("Copie impossible : sélectionnez la clé manuellement.");
    }
  }

  return (
    <>
      <div className="tools" style={{ marginBottom: "1.25rem", gap: "0.75rem" }}>
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          Créer une clé API
        </button>
        <span className="muted-text">
          {activeCount} clé{activeCount > 1 ? "s" : ""} active{activeCount > 1 ? "s" : ""} · accès
          server-to-server uniquement
        </span>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Préfixe</th>
              <th>Portée</th>
              <th>Dernière utilisation</th>
              <th>Expiration</th>
              <th>Statut</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted-text">
                  Aucune clé API. Créez une clé pour connecter un service externe.
                </td>
              </tr>
            ) : (
              keys.map((key) => {
                const status = apiKeyStatus(key);
                return (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td>
                      <code>{key.keyPrefix}…</code>
                    </td>
                    <td>
                      <span className="badge muted">Lecture des fiches</span>
                    </td>
                    <td>{formatDate(key.lastUsedAt)}</td>
                    <td>{key.expiresAt === null ? "Jamais" : formatDate(key.expiresAt)}</td>
                    <td>
                      <span className={`badge ${status === "active" ? "" : "muted"}`}>
                        {statusLabel(key)}
                      </span>
                    </td>
                    <td>
                      {status === "active" ? (
                        <button
                          type="button"
                          className="btn danger ghost small"
                          onClick={() => void revokeKey(key)}
                        >
                          Révoquer
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

      {creating ? (
        <div className="modal-overlay">
          <button
            type="button"
            className="modal-backdrop"
            aria-label="Fermer"
            onClick={() => setCreating(false)}
          />
          <div className="modal" role="dialog" aria-modal="true" aria-label="Créer une clé API">
            <div className="modal-head">
              <h3>Créer une clé API</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setCreating(false)}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <form
                className="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createKey();
                }}
              >
                <label className="field">
                  Nom de la clé
                  <input
                    type="text"
                    value={name}
                    maxLength={120}
                    placeholder="Ex. Intégration CRM, site partenaire"
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  Expiration
                  <select
                    value={expiresInDays}
                    onChange={(event) => setExpiresInDays(event.target.value)}
                  >
                    <option value="30">30 jours</option>
                    <option value="90">90 jours</option>
                    <option value="365">1 an</option>
                    <option value="never">Jamais</option>
                  </select>
                </label>
                <p className="hint">
                  La clé donne un accès en lecture à toutes les fiches de l’organisation active.
                  Elle ne peut pas être utilisée depuis un navigateur.
                </p>
                <div className="tools">
                  <button
                    type="submit"
                    className="btn"
                    disabled={pending || name.trim().length < 2}
                  >
                    {pending ? "Création…" : "Créer la clé"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setCreating(false)}
                    disabled={pending}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {created !== null ? (
        <div className="modal-overlay">
          <button
            type="button"
            className="modal-backdrop"
            aria-label="Fermer"
            onClick={() => setCreated(null)}
          />
          <div className="modal" role="dialog" aria-modal="true" aria-label="Clé API créée">
            <div className="modal-head">
              <h3>Clé API créée</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setCreated(null)}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="alert warn">
                Copiez cette clé maintenant. Elle ne sera plus jamais affichée.
              </p>
              <label className="field">
                Clé secrète
                <input
                  type="text"
                  readOnly
                  value={created.secret}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <div className="tools">
                <button type="button" className="btn" onClick={() => void copySecret()}>
                  {copied ? "Copiée" : "Copier la clé"}
                </button>
                <button type="button" className="btn ghost" onClick={() => setCreated(null)}>
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
