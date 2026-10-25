"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { InvitationStatus } from "@/domain/entities/invitation";
import type { Role } from "@/domain/entities/user";

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

const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  marketeur: "Marketeur",
  lecteur: "Lecteur",
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

  const onOrganizationChange = (value: string): void => {
    setOrganizationId(value);
    if (value === "") setRole("admin");
  };

  const onCreate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, role }),
      });
      const json = (await response.json()) as CreateResponse;
      if (!response.ok || json.invitation === undefined) {
        setError(json.error ?? "Création impossible");
        return;
      }
      setInvitations((current) => [json.invitation as InvitationDto, ...current]);
      setRole(organizationId === "" ? "admin" : "lecteur");
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
    if (!window.confirm("Révoquer cette invitation ? Le lien ne fonctionnera plus.")) return;
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

        <label className="field">
          Rôle
          <select
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            disabled={organizationId === ""}
          >
            <option value="lecteur">Lecteur</option>
            <option value="marketeur">Marketeur</option>
            <option value="admin">Administrateur</option>
          </select>
        </label>

        <div className="tools">
          <button type="submit" className="btn small" disabled={pending}>
            {pending ? "Création…" : "Créer le lien"}
          </button>
        </div>
      </form>

      <div className="table-scroll">
        <table className="table">
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
                  <td>{invitation.organizationName ?? "Organisation personnelle"}</td>
                  <td>{ROLE_LABELS[invitation.role]}</td>
                  <td>
                    <span className={STATUS_CLASS[invitation.status]}>
                      {STATUS_LABELS[invitation.status]}
                    </span>
                  </td>
                  <td>{formatDate(invitation.expiresAt)}</td>
                  <td>{invitation.invitedByEmail}</td>
                  <td>
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
                  <td>
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
