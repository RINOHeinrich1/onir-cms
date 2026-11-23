"use client";

import { useEffect, useState } from "react";

type BuildStatus = "queued" | "building" | "ready" | "failed" | "active" | "superseded";
type VerificationStatus = "pending" | "verifying" | "verified" | "failed";
type SslStatus = "pending" | "issuing" | "active" | "failed" | "expired";

type Build = {
  id: string;
  buildNumber: number;
  status: BuildStatus;
  error: string | null;
  createdAt: string;
  artifactSha256: string | null;
};

type Domain = {
  id: string;
  hostname: string;
  kind: "platform_subdomain" | "custom_domain";
  isPrimary: boolean;
  verificationStatus: VerificationStatus;
  sslStatus: SslStatus;
  verificationRecord: string | null;
  verificationValue: string | null;
  cnameTarget: string | null;
  lastError: string | null;
};

type State = {
  settings: { enabled: boolean; activeBuildId: string | null };
  builds: Build[];
  domains: Domain[];
};

const BUILD_LABELS: Record<BuildStatus, string> = {
  queued: "En attente",
  building: "Construction",
  ready: "Prêt à publier",
  failed: "Échec",
  active: "Actif",
  superseded: "Remplacé",
};

const DOMAIN_LABELS: Record<VerificationStatus, string> = {
  pending: "DNS en attente",
  verifying: "Vérification",
  verified: "DNS vérifié",
  failed: "DNS en erreur",
};

const SSL_LABELS: Record<SslStatus, string> = {
  pending: "SSL en attente",
  issuing: "Certificat en cours",
  active: "SSL actif",
  failed: "SSL en erreur",
  expired: "SSL expiré",
};

function badgeClass(value: string): string {
  if (value === "active" || value === "verified" || value === "ready") return "badge success";
  if (value === "failed" || value === "expired") return "badge danger";
  if (value === "queued" || value === "building" || value === "pending" || value === "verifying") {
    return "badge warn";
  }
  return "badge muted";
}

export function StandalonePublicationCard({ chatLinkId }: { chatLinkId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hostname, setHostname] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/links/${chatLinkId}/standalone`, { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as
          | (State & { error?: string })
          | null;
        if (!response.ok || json === null) throw new Error(json?.error ?? "Chargement impossible");
        if (!cancelled) setState(json);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Chargement impossible");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chatLinkId]);

  async function action(name: string, payload: Record<string, unknown> = {}): Promise<void> {
    setBusy(name);
    setError(null);
    try {
      const response = await fetch(`/api/links/${chatLinkId}/standalone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: name, ...payload }),
      });
      const json = (await response.json().catch(() => null)) as (State & { error?: string }) | null;
      if (!response.ok || json === null) throw new Error(json?.error ?? "Action impossible");
      setState(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action impossible");
    } finally {
      setBusy(null);
    }
  }

  const activeBuild =
    state?.builds.find((build) => build.id === state.settings.activeBuildId) ?? null;

  return (
    <section className="chatbot-card standalone-card">
      <div className="chatbot-step-head">
        <div>
          <h4>Site autonome</h4>
          <p className="hint">
            Front public statique sur un domaine dédié. Le chat continue d’utiliser l’API ONIR-CMS.
          </p>
        </div>
        {state === null ? null : (
          <span className={state.settings.enabled ? "badge success" : "badge muted"}>
            {state.settings.enabled ? "Activé" : "Désactivé"}
          </span>
        )}
      </div>

      {loading ? <p className="hint">Chargement de l’état standalone…</p> : null}
      {error !== null ? <p className="alert error">{error}</p> : null}

      {state !== null ? (
        <>
          <label className="check channel-toggle">
            <input
              type="checkbox"
              checked={state.settings.enabled}
              disabled={busy !== null}
              onChange={(event) => void action(event.target.checked ? "enable" : "disable")}
            />
            <span>
              <strong>Activer le site autonome</strong>
              <small>
                Désactivé par défaut. Le mode actuel reste inchangé tant que cette option est off.
              </small>
            </span>
          </label>

          <div
            style={{ borderTop: "1px solid var(--border)", marginTop: "1rem", paddingTop: "1rem" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong>Build</strong>
                <p className="hint" style={{ margin: "0.25rem 0 0" }}>
                  {activeBuild === null
                    ? "Aucun build actif."
                    : `Build #${activeBuild.buildNumber} · ${BUILD_LABELS[activeBuild.status]}`}
                </p>
              </div>
              <button
                type="button"
                className="btn ghost small"
                disabled={busy !== null}
                onClick={() => void action("build")}
              >
                {busy === "build" ? "Mise en file…" : "Construire"}
              </button>
            </div>

            {state.builds.length === 0 ? (
              <p className="hint">Aucun build pour ce chatbot.</p>
            ) : (
              <ul className="standalone-build-list">
                {state.builds.slice(0, 5).map((build) => (
                  <li key={build.id}>
                    <span>
                      #{build.buildNumber} · {new Date(build.createdAt).toLocaleString("fr-FR")}
                    </span>
                    <span className={badgeClass(build.status)}>{BUILD_LABELS[build.status]}</span>
                    {build.status === "ready" ? (
                      <button
                        type="button"
                        className="link"
                        disabled={busy !== null}
                        onClick={() => void action("activate", { buildId: build.id })}
                      >
                        Publier
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            style={{ borderTop: "1px solid var(--border)", marginTop: "1rem", paddingTop: "1rem" }}
          >
            <strong>Domaine personnalisé</strong>
            {state.domains.length === 0 ? (
              <p className="hint">Aucun domaine personnalisé.</p>
            ) : (
              <div className="standalone-domain-list">
                {state.domains.map((domain) => (
                  <article key={domain.id} className="standalone-domain-item">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "1rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <strong>{domain.hostname}</strong>
                      <span className={badgeClass(domain.verificationStatus)}>
                        {DOMAIN_LABELS[domain.verificationStatus]}
                      </span>
                      <span className={badgeClass(domain.sslStatus)}>
                        {SSL_LABELS[domain.sslStatus]}
                      </span>
                    </div>
                    {domain.verificationRecord !== null && domain.verificationValue !== null ? (
                      <p className="hint">
                        TXT : <code>{domain.verificationRecord}</code> →{" "}
                        <code>{domain.verificationValue}</code>
                        {domain.cnameTarget === null ? null : (
                          <>
                            <br />
                            CNAME : <code>{domain.hostname}</code> →{" "}
                            <code>{domain.cnameTarget}</code>
                          </>
                        )}
                      </p>
                    ) : null}
                    {domain.lastError === null ? null : (
                      <p className="alert error">{domain.lastError}</p>
                    )}
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {domain.verificationStatus !== "verified" ? (
                        <button
                          type="button"
                          className="btn ghost small"
                          disabled={busy !== null}
                          onClick={() => void action("verify-domain", { domainId: domain.id })}
                        >
                          Vérifier le DNS
                        </button>
                      ) : null}
                      {domain.verificationStatus === "verified" && !domain.isPrimary ? (
                        <button
                          type="button"
                          className="btn ghost small"
                          disabled={busy !== null}
                          onClick={() => void action("primary-domain", { domainId: domain.id })}
                        >
                          Définir comme principal
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="link"
                        disabled={busy !== null}
                        onClick={() => void action("delete-domain", { domainId: domain.id })}
                      >
                        Supprimer
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <form
              style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}
              onSubmit={(event) => {
                event.preventDefault();
                if (hostname.trim() === "") return;
                void action("add-domain", { hostname: hostname.trim() }).then(() =>
                  setHostname(""),
                );
              }}
            >
              <input
                className="input"
                type="text"
                placeholder="ex. www.mon-site.com"
                value={hostname}
                disabled={busy !== null}
                onChange={(event) => setHostname(event.target.value)}
              />
              <button
                className="btn ghost small"
                type="submit"
                disabled={busy !== null || hostname.trim() === ""}
              >
                Ajouter le domaine
              </button>
            </form>
          </div>
        </>
      ) : null}
    </section>
  );
}
