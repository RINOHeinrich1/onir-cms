"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { InvitationStatus } from "@/domain/entities/invitation";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/entities/user";

export type InvitationDto = {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  role: Role;
  invitedByEmail: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  url: string | null;
  status: InvitationStatus;
};

type OrganizationOption = { id: string; name: string };

type CreateResponse = {
  invitation?: InvitationDto;
  error?: string;
};

type CatalogModel = { modelId: string; label: string; enabled: boolean };
type CatalogProvider = {
  id: string;
  label: string;
  organizationName: string;
  models: CatalogModel[];
};
type CatalogCluster = { id: string; label: string; organizationName: string; actif: boolean };
type Catalog = { providers: CatalogProvider[]; clusters: CatalogCluster[] };
type OfferOption = { id: string; name: string; description: string };

type AllocationTarget =
  | { kind: "model"; providerId: string; model: string }
  | { kind: "cluster"; clusterId: string };

type AllocationDraft = {
  key: string;
  target: AllocationTarget;
  maxTokens: string;
};

const STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  revoked: "Révoquée",
  expired: "Expirée",
};

const STATUS_CLASS: Record<InvitationStatus, string> = {
  pending: "badge orange",
  accepted: "badge",
  revoked: "badge muted",
  expired: "badge warn",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Gestion des invitations : création de lien, copie, révocation. */
export function InvitationsManager({
  initialInvitations,
  organizations,
  isSuperAdmin,
  activeOrganizationId,
}: {
  initialInvitations: InvitationDto[];
  organizations: OrganizationOption[];
  isSuperAdmin: boolean;
  activeOrganizationId: string | null;
}) {
  const initialOrganizationId = activeOrganizationId ?? "";
  const [invitations, setInvitations] = useState(initialInvitations);
  const [role, setRole] = useState<Role>(initialOrganizationId === "" ? "admin" : "lecteur");
  const [organizationId, setOrganizationId] = useState(initialOrganizationId);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [maxChatbots, setMaxChatbots] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [resetMode, setResetMode] = useState<"manual" | "duration">("manual");
  const [resetDays, setResetDays] = useState("");
  const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
  const [resource, setResource] = useState("");

  useEffect(() => {
    if (!isSuperAdmin || organizationId !== "") return;
    let active = true;
    void Promise.all([
      fetch("/api/admin/ai/catalog", { cache: "no-store" }),
      fetch("/api/platform/offers", { cache: "no-store" }),
    ])
      .then(async ([catalogResponse, offersResponse]) => {
        const catalogJson = (await catalogResponse.json()) as Catalog & { error?: string };
        const offersJson = (await offersResponse.json()) as {
          offers?: OfferOption[];
          error?: string;
        };
        if (!catalogResponse.ok) {
          throw new Error(catalogJson.error ?? "Catalogue IA indisponible");
        }
        if (!offersResponse.ok) {
          throw new Error(offersJson.error ?? "Offres indisponibles");
        }
        if (active) {
          setCatalog(catalogJson);
          setOffers(offersJson.offers ?? []);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Catalogue IA indisponible");
      });
    return () => {
      active = false;
    };
  }, [isSuperAdmin, organizationId]);

  const onOrganizationChange = (value: string): void => {
    setOrganizationId(value);
    if (value === "") setRole("admin");
  };

  const resourceOptions = (): { value: string; label: string }[] => {
    if (catalog === null) return [];
    return [
      ...catalog.providers.flatMap((provider) =>
        provider.models
          .filter((model) => model.enabled)
          .map((model) => ({
            value: JSON.stringify({
              kind: "model",
              providerId: provider.id,
              model: model.modelId,
            }),
            label: `${provider.organizationName} · ${provider.label} · ${model.label}`,
          })),
      ),
      ...catalog.clusters
        .filter((cluster) => cluster.actif)
        .map((cluster) => ({
          value: JSON.stringify({ kind: "cluster", clusterId: cluster.id }),
          label: `${cluster.organizationName} · Cluster ${cluster.label}`,
        })),
    ];
  };

  const addAllocation = (): void => {
    if (resource === "") return;
    const target = JSON.parse(resource) as AllocationTarget;
    const key = `${target.kind}:${target.kind === "model" ? `${target.providerId}:${target.model}` : target.clusterId}`;
    if (allocations.some((entry) => entry.key === key)) return;
    setAllocations((current) => [...current, { key, target, maxTokens: "" }]);
    setResource("");
  };

  const onCreate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const usingOffer = organizationId === "" && selectedOfferId !== "";
      const provisioning =
        !usingOffer &&
        organizationId === "" &&
        (maxChatbots !== "" ||
          maxTokens !== "" ||
          allocations.length > 0 ||
          resetMode === "duration")
          ? {
              maxChatbots: maxChatbots === "" ? null : Number(maxChatbots),
              maxTokens: maxTokens === "" ? null : Number(maxTokens),
              tokenResetMode: resetMode,
              tokenResetDays: resetMode === "duration" ? Number(resetDays) : null,
              allocations: allocations.map((entry) => ({
                target: entry.target,
                maxTokens: entry.maxTokens === "" ? null : Number(entry.maxTokens),
              })),
              defaults: [],
            }
          : null;
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          role,
          provisioning,
          offerId: usingOffer ? selectedOfferId : undefined,
        }),
      });
      const json = (await response.json()) as CreateResponse;
      if (!response.ok || json.invitation === undefined) {
        setError(json.error ?? "Création impossible");
        return;
      }
      setInvitations((current) => [json.invitation as InvitationDto, ...current]);
      setRole(organizationId === "" ? "admin" : "lecteur");
      setMaxChatbots("");
      setMaxTokens("");
      setResetMode("manual");
      setResetDays("");
      setAllocations([]);
      setSelectedOfferId("");
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const onCopy = async (invitation: InvitationDto): Promise<void> => {
    if (invitation.url === null) return;
    try {
      await navigator.clipboard.writeText(invitation.url);
      setCopied(invitation.id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Copie impossible — sélectionnez le lien manuellement");
    }
  };

  const onRevoke = async (invitation: InvitationDto): Promise<void> => {
    if (!(await confirmDialog("Révoquer cette invitation ? Le lien ne fonctionnera plus."))) return;
    setError(null);
    try {
      const response = await fetch(`/api/invitations/${invitation.id}`, { method: "DELETE" });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Révocation impossible");
        return;
      }
      setInvitations((current) =>
        current.map((item) =>
          item.id === invitation.id
            ? { ...item, status: "revoked", revokedAt: new Date().toISOString() }
            : item,
        ),
      );
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  return (
    <>
      <form className="form card" onSubmit={onCreate} noValidate>
        <h3>Nouvelle invitation</h3>
        {error !== null ? <p className="alert error">{error}</p> : null}

        {isSuperAdmin ? (
          <label className="field">
            Organisation
            <select
              name="organizationId"
              value={organizationId}
              onChange={(event) => onOrganizationChange(event.target.value)}
            >
              <option value="">Aucune — organisation personnelle admin</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
            <span className="hint">
              Sans organisation, l&apos;invité devient admin de sa propre organisation.
            </span>
          </label>
        ) : null}

        {isSuperAdmin && organizationId === "" ? (
          <div>
            <h4>Paramétrage de l&apos;organisation invitée</h4>
            <label className="field">
              Offre (optionnel)
              <select
                value={selectedOfferId}
                onChange={(event) => setSelectedOfferId(event.target.value)}
              >
                <option value="">Personnalisé</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name}
                  </option>
                ))}
              </select>
              <span className="hint">
                Une offre applique son snapshot de limites à l&apos;acceptation.
              </span>
            </label>
            {selectedOfferId === "" ? (
              <>
                <div className="grid-2">
                  <label className="field">
                    Nombre maximal de chatbots
                    <input
                      type="number"
                      min="0"
                      placeholder="Illimité"
                      value={maxChatbots}
                      onChange={(event) => setMaxChatbots(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Budget global de tokens
                    <input
                      type="number"
                      min="0"
                      placeholder="Illimité"
                      value={maxTokens}
                      onChange={(event) => setMaxTokens(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Réinitialisation
                    <select
                      value={resetMode}
                      onChange={(event) =>
                        setResetMode(event.target.value === "duration" ? "duration" : "manual")
                      }
                    >
                      <option value="manual">Manuelle</option>
                      <option value="duration">Automatique</option>
                    </select>
                  </label>
                  {resetMode === "duration" ? (
                    <label className="field">
                      Durée (jours)
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        value={resetDays}
                        onChange={(event) => setResetDays(event.target.value)}
                      />
                    </label>
                  ) : null}
                </div>

                <p className="hint">
                  La première ressource ajoutée devient la ressource par défaut pour tous les usages
                  IA de l’organisation invitée.
                </p>
                <label className="field">
                  Modèle ou cluster disponible
                  <select value={resource} onChange={(event) => setResource(event.target.value)}>
                    <option value="">— Choisir une ressource partagée —</option>
                    {resourceOptions().map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="tools">
                  <button type="button" className="btn ghost small" onClick={addAllocation}>
                    Ajouter cette ressource
                  </button>
                </div>
                {allocations.map((entry, index) => (
                  <div className="field-row" key={entry.key}>
                    <div className="grid-2">
                      <span className="hint">
                        {entry.target.kind === "model"
                          ? `${entry.target.providerId} · ${entry.target.model}`
                          : `Cluster · ${entry.target.clusterId}`}
                      </span>
                      <label className="field">
                        Budget de tokens
                        <input
                          type="number"
                          min="0"
                          placeholder="Illimité"
                          value={entry.maxTokens}
                          onChange={(event) =>
                            setAllocations((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, maxTokens: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="tools">
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() =>
                          setAllocations((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        <label className="field">
          Rôle
          <select
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            disabled={organizationId === ""}
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <div className="tools">
          <button type="submit" className="btn small" disabled={pending}>
            {pending ? "Création…" : "Créer le lien"}
          </button>
        </div>
      </form>

      <div className="table-scroll">
        <table className="table table-cards">
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Expire le</th>
              <th>Invité par</th>
              <th>Lien</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invitations.length === 0 ? (
              <tr>
                <td colSpan={7} className="hint">
                  Aucune invitation pour le moment.
                </td>
              </tr>
            ) : (
              invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td data-label="Organisation">
                    {invitation.organizationName ?? "Organisation personnelle"}
                  </td>
                  <td data-label="Rôle">{ROLE_LABELS[invitation.role]}</td>
                  <td data-label="Statut">
                    <span className={STATUS_CLASS[invitation.status]}>
                      {STATUS_LABELS[invitation.status]}
                    </span>
                  </td>
                  <td data-label="Expire le">{formatDate(invitation.expiresAt)}</td>
                  <td data-label="Invité par">{invitation.invitedByEmail}</td>
                  <td data-label="Lien">
                    {invitation.status === "pending" && invitation.url !== null ? (
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => void onCopy(invitation)}
                      >
                        {copied === invitation.id ? "Copié" : "Copier le lien"}
                      </button>
                    ) : (
                      <span className="hint">—</span>
                    )}
                  </td>
                  <td data-label="Actions" className="cell-actions">
                    {invitation.status === "pending" ? (
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => void onRevoke(invitation)}
                      >
                        Révoquer
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
