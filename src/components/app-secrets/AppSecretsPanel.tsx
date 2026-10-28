"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/Modal";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";

type SecretKey = "SESSION_SECRET" | "LINK_TOKEN_KEY" | "AI_PROVIDER_KEY" | "WEBHOOK_SECRET_KEY";

type SecretImpact = {
  links: number;
  invitations: number;
  providers: number;
  webhooks: number;
  sealedSecrets: number;
};

type SecretStatus = {
  key: SecretKey;
  label: string;
  description: string;
  impactLabel: string;
  source: "database" | "environment" | "missing";
  fingerprint: string | null;
  version: number | null;
  updatedAt: string | null;
  impact: SecretImpact;
};

type Overview = {
  masterConfigured: boolean;
  managed: boolean;
  masterError: string | null;
  secrets: SecretStatus[];
};

type Generated = { key: SecretKey; value: string };

const HEX_64 = /^[0-9a-f]{64}$/;

function impactText(secret: SecretStatus): string {
  const { impact } = secret;
  switch (secret.key) {
    case "SESSION_SECRET":
      return `${impact.sealedSecrets} identifiant(s) scellé(s)`;
    case "LINK_TOKEN_KEY":
      return `${impact.links} lien(s) et ${impact.invitations} invitation(s)`;
    case "AI_PROVIDER_KEY":
      return `${impact.providers} fournisseur(s) IA`;
    case "WEBHOOK_SECRET_KEY":
      return `${impact.webhooks} webhook(s)`;
  }
}

function sourceLabel(source: SecretStatus["source"]): string {
  if (source === "database") return "base";
  if (source === "environment") return "environnement";
  return "absent";
}

function formatDate(value: string | null): string {
  if (value === null) return "—";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export function AppSecretsPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<SecretKey | null>(null);
  const [replaceSecret, setReplaceSecret] = useState<SecretStatus | null>(null);
  const [replaceValue, setReplaceValue] = useState("");
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/admin/app-secrets", { cache: "no-store" });
      const json = (await response.json()) as Overview & { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Impossible de charger les secrets");
        return;
      }
      setOverview(json);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate(secret: SecretStatus): Promise<void> {
    if (
      !(await confirmDialog(
        `Générer une nouvelle valeur pour « ${secret.label} » ?\n\n` +
          `Impact : ${impactText(secret)} sera ré-chiffré. ` +
          "L’ancienne valeur ne sera plus utilisable.",
      ))
    ) {
      return;
    }
    setBusyKey(secret.key);
    setError(null);
    try {
      const response = await fetch(`/api/admin/app-secrets/${secret.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generate" }),
      });
      const json = (await response.json()) as {
        generatedValue?: string | null;
        overview?: Overview;
        error?: string;
      };
      if (!response.ok || json.overview === undefined || !json.generatedValue) {
        setError(json.error ?? "Génération impossible");
        return;
      }
      setOverview(json.overview);
      setGenerated({ key: secret.key, value: json.generatedValue });
      toast.success("Nouvelle valeur générée et appliquée.");
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setBusyKey(null);
    }
  }

  async function replace(): Promise<void> {
    if (replaceSecret === null) return;
    const normalized = replaceValue.trim().toLowerCase();
    if (!HEX_64.test(normalized)) {
      setError("La valeur doit contenir exactement 64 caractères hexadécimaux");
      return;
    }
    if (
      !(await confirmDialog(
        `Remplacer « ${replaceSecret.label} » ?\n\n` +
          `Impact : ${impactText(replaceSecret)} sera ré-chiffré. ` +
          "L’ancienne valeur ne sera plus utilisable.",
      ))
    ) {
      return;
    }
    setBusyKey(replaceSecret.key);
    setError(null);
    try {
      const response = await fetch(`/api/admin/app-secrets/${replaceSecret.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "replace", value: normalized }),
      });
      const json = (await response.json()) as { overview?: Overview; error?: string };
      if (!response.ok || json.overview === undefined) {
        setError(json.error ?? "Remplacement impossible");
        return;
      }
      setOverview(json.overview);
      setReplaceSecret(null);
      setReplaceValue("");
      toast.success("Secret remplacé et données ré-chiffrées.");
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setBusyKey(null);
    }
  }

  async function copyGenerated(): Promise<void> {
    if (generated === null) return;
    try {
      await navigator.clipboard.writeText(generated.value);
      toast.success("Valeur copiée.");
    } catch {
      setError("Copie impossible : sélectionnez la valeur manuellement.");
    }
  }

  if (loading) {
    return (
      <section className="card" style={{ marginTop: "1.5rem" }}>
        <h2 className="text-title" style={{ fontSize: "1.1rem" }}>
          Secrets applicatifs
        </h2>
        <p className="hint">Chargement des secrets…</p>
      </section>
    );
  }

  return (
    <section className="card" style={{ marginTop: "1.5rem" }}>
      <div className="page-head" style={{ marginBottom: "0.75rem" }}>
        <div>
          <h2 className="text-title" style={{ fontSize: "1.1rem" }}>
            Secrets applicatifs
          </h2>
          <p className="hint">
            Clés globales de chiffrement et de signature. Les valeurs existantes ne sont jamais
            réaffichées : générez une nouvelle valeur ou remplacez-la.
          </p>
        </div>
      </div>

      {error !== null ? <p className="alert error">{error}</p> : null}

      {overview?.masterConfigured !== true ? (
        <p className="alert warn">
          <strong>CONFIG_MASTER_KEY</strong> n’est pas configurée. La gestion depuis cette page est
          désactivée ; ajoutez-la dans <code>.env.release</code> puis redémarrez.
        </p>
      ) : null}
      {overview?.masterError !== null && overview?.masterError !== undefined ? (
        <p className="alert error">{overview.masterError}</p>
      ) : null}
      {overview?.masterConfigured === true && overview.managed !== true ? (
        <p className="alert warn">
          Les secrets ne sont pas encore chargés depuis la base. Vérifiez les logs de démarrage.
        </p>
      ) : null}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Secret</th>
              <th>Source</th>
              <th>Empreinte</th>
              <th>Impact</th>
              <th>Dernière modification</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {(overview?.secrets ?? []).map((secret) => (
              <tr key={secret.key}>
                <td>
                  <strong>{secret.label}</strong>
                  <div className="hint">
                    <code>{secret.key}</code> · {secret.description}
                  </div>
                </td>
                <td>
                  <span className={`badge ${secret.source === "database" ? "" : "muted"}`}>
                    {sourceLabel(secret.source)}
                  </span>
                </td>
                <td>
                  <code>{secret.fingerprint ?? "—"}</code>
                </td>
                <td>{impactText(secret)}</td>
                <td>{formatDate(secret.updatedAt)}</td>
                <td>
                  <div className="tools">
                    <button
                      type="button"
                      className="btn small"
                      disabled={overview?.managed !== true || busyKey !== null}
                      onClick={() => void generate(secret)}
                    >
                      {busyKey === secret.key ? "Génération…" : "Générer"}
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      disabled={overview?.managed !== true || busyKey !== null}
                      onClick={() => {
                        setReplaceSecret(secret);
                        setReplaceValue("");
                      }}
                    >
                      Remplacer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: "0.75rem" }}>
        La rotation ré-chiffre immédiatement les données dépendantes. Les URLs signées déjà émises
        pour les médias et pièces jointes expirent sous une heure.
      </p>

      {replaceSecret !== null ? (
        <Modal
          title={`Remplacer ${replaceSecret.label}`}
          onClose={() => {
            setReplaceSecret(null);
            setReplaceValue("");
          }}
        >
          <p className="hint">
            Impact : {impactText(replaceSecret)}. La valeur doit contenir 64 caractères
            hexadécimaux.
          </p>
          <label className="field">
            Nouvelle valeur
            <input
              type="password"
              autoComplete="new-password"
              value={replaceValue}
              onChange={(event) => setReplaceValue(event.target.value)}
              placeholder="64 caractères hexadécimaux"
            />
          </label>
          <div className="tools">
            <button
              type="button"
              className="btn"
              disabled={busyKey !== null}
              onClick={() => void replace()}
            >
              {busyKey !== null ? "Application…" : "Remplacer et ré-chiffrer"}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={busyKey !== null}
              onClick={() => {
                setReplaceSecret(null);
                setReplaceValue("");
              }}
            >
              Annuler
            </button>
          </div>
        </Modal>
      ) : null}

      {generated !== null ? (
        <Modal title="Nouvelle valeur générée" onClose={() => setGenerated(null)}>
          <p className="alert warn">
            Cette valeur ne sera plus affichée. Copiez-la maintenant si vous devez la conserver.
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              padding: "0.85rem",
              borderRadius: "0.5rem",
              background: "var(--surface-2, #f4f4f5)",
            }}
          >
            {generated.value}
          </pre>
          <div className="tools">
            <button type="button" className="btn" onClick={() => void copyGenerated()}>
              Copier
            </button>
            <button type="button" className="btn ghost" onClick={() => setGenerated(null)}>
              Fermer
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
