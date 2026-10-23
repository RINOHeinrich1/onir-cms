"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  configured: boolean;
  userName: string | null;
  target: string;
  revision: number | null;
  rotatedAt: string | null;
  validityDays: number | null;
  expiresAt: string | null;
  envOverride: boolean;
};

export function DatabaseReaderAccount() {
  const [status, setStatus] = useState<Status | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [validityDays, setValidityDays] = useState("0");

  const load = useCallback(async (): Promise<void> => {
    const response = await fetch("/api/admin/database/reader");
    if (response.ok) {
      const next = (await response.json()) as Status;
      setStatus(next);
      setValidityDays(String(next.validityDays ?? 0));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function rotate(): Promise<void> {
    if (
      !window.confirm(
        "Générer un nouveau mot de passe et l'appliquer immédiatement au rôle de lecture ?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    setPassword(null);
    try {
      const response = await fetch("/api/admin/database/reader/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validityDays: Number(validityDays) }),
      });
      const json = (await response.json()) as {
        password?: string;
        status?: Status;
        error?: string;
      };
      if (!response.ok || json.password === undefined || json.status === undefined) {
        throw new Error(json.error ?? "Rotation impossible");
      }
      setPassword(json.password);
      setStatus(json.status);
      setMessage("Mot de passe appliqué. Il est affiché une seule fois.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rotation impossible");
    } finally {
      setBusy(false);
    }
  }

  async function applyValidity(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/database/reader", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validityDays: Number(validityDays) }),
      });
      const json = (await response.json()) as { status?: Status; error?: string };
      if (!response.ok || json.status === undefined) {
        throw new Error(json.error ?? "Durée de validité non appliquée");
      }
      setStatus(json.status);
      setValidityDays(String(json.status.validityDays ?? 0));
      setMessage("Durée de validité appliquée au mot de passe courant.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Durée de validité non appliquée");
    } finally {
      setBusy(false);
    }
  }

  async function test(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/database/reader/test", { method: "POST" });
      const json = (await response.json()) as { user?: string; source?: string; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Test impossible");
      setMessage(
        `Connexion OK : ${json.user} (${json.source === "env" ? "variable d'environnement" : "panneau"}).`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test impossible");
    } finally {
      setBusy(false);
    }
  }

  async function copy(): Promise<void> {
    if (password === null) return;
    try {
      await navigator.clipboard.writeText(password);
      setMessage("Mot de passe copié.");
    } catch {
      setMessage("Copie impossible : sélectionnez le mot de passe manuellement.");
    }
  }

  return (
    <section className="card" style={{ marginTop: "1.5rem" }}>
      <div className="page-head" style={{ marginBottom: "0.75rem" }}>
        <div>
          <h2 className="text-title" style={{ fontSize: "1.1rem" }}>
            Compte de lecture des données
          </h2>
          <p className="hint">
            Rôle PostgreSQL utilisé par les templates pour lire leurs ressources (ADR-0026). La
            rotation est immédiate : le prochain chargement reconstruit la connexion.
          </p>
        </div>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Rôle</th>
              <th>Base de données</th>
              <th>Mot de passe</th>
              <th>Rotation</th>
              <th>Validité</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>{status?.userName ?? "template_reader_login"}</code>
              </td>
              <td>
                <code>{status?.target ?? "…"}</code>
              </td>
              <td>{status?.configured === true ? "••••••••" : "non configuré"}</td>
              <td>
                {status?.rotatedAt === null || status?.rotatedAt === undefined
                  ? "—"
                  : `${new Date(status.rotatedAt).toLocaleString("fr-FR")} · rév. ${status.revision ?? "?"}`}
              </td>
              <td>
                {status?.validityDays === 0 || status?.validityDays === null
                  ? "illimitée"
                  : `${status?.validityDays ?? 0} jour(s)${
                      status?.expiresAt === null || status?.expiresAt === undefined
                        ? ""
                        : ` · expire le ${new Date(status.expiresAt).toLocaleString("fr-FR")}`
                    }`}
              </td>
              <td>
                <div className="tools" style={{ gap: "0.4rem" }}>
                  <button
                    className="btn ghost small"
                    type="button"
                    disabled={busy || status?.configured !== true}
                    onClick={() => void test()}
                  >
                    Tester
                  </button>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={3650}
                    style={{ width: "6.5rem" }}
                    value={validityDays}
                    disabled={busy}
                    aria-label="Durée de validité en jours (0 = illimitée)"
                    onChange={(event) => setValidityDays(event.target.value)}
                  />
                  <button
                    className="btn ghost small"
                    type="button"
                    disabled={busy || status?.configured !== true}
                    onClick={() => void applyValidity()}
                  >
                    Appliquer la durée
                  </button>
                  <button
                    className="btn small"
                    type="button"
                    disabled={busy}
                    onClick={() => void rotate()}
                  >
                    Générer un mot de passe
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: "0.5rem" }}>
        Durée en jours (0 = illimitée). Le runtime renouvelle automatiquement le mot de passe
        jusqu'à 7 jours avant l'échéance, sans interruption.
      </p>

      {status?.envOverride === true ? (
        <p className="hint" style={{ marginTop: "0.75rem" }}>
          <strong>Attention :</strong> <code>TEMPLATE_DATABASE_URL</code> est défini dans
          l'environnement. Il a priorité sur ce compte : une rotation ici ne sera pas utilisée tant
          que la variable est présente.
        </p>
      ) : null}

      {password !== null ? (
        <div style={{ marginTop: "0.75rem" }}>
          <p className="hint">Mot de passe généré (affiché une seule fois) :</p>
          <pre
            className="mono"
            style={{ padding: "0.75rem", background: "var(--surface-raised)", borderRadius: 8 }}
          >
            {password}
          </pre>
          <button className="btn ghost small" type="button" onClick={() => void copy()}>
            Copier
          </button>
        </div>
      ) : null}

      {message !== null ? (
        <p className="hint" style={{ marginTop: "0.75rem" }}>
          {message}
        </p>
      ) : null}
    </section>
  );
}
