"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/Modal";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { Organization } from "@/domain/entities/organization";
import { OrganizationForm } from "./OrganizationForm";

type ProfileOption = { id: string; name: string; active: boolean };

function LimitProfileCell({
  organization,
  profiles,
  onApplied,
  onError,
}: {
  organization: Organization;
  profiles: ProfileOption[];
  onApplied: (organizationId: string, profileId: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const [profileId, setProfileId] = useState(organization.limitProfileId ?? "");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setProfileId(organization.limitProfileId ?? "");
  }, [organization.limitProfileId]);

  const apply = async (): Promise<void> => {
    if (profileId === "") return;
    const profile = profiles.find((entry) => entry.id === profileId);
    if (profile === undefined) return;
    const confirmed = await confirmDialog(
      `Appliquer le profil « ${profile.name} » à l’organisation « ${organization.name} » ?`,
      {
        title: "Changer le profil de limites",
        confirmLabel: "Appliquer",
        danger: false,
      },
    );
    if (!confirmed) return;
    setPending(true);
    onError(null);
    try {
      const response = await fetch(`/api/organizations/${organization.id}/limit-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        onError(json.error ?? "Application du profil impossible");
        return;
      }
      onApplied(organization.id, profileId);
    } catch {
      onError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="limit-profile-cell">
      <select
        value={profileId}
        onChange={(event) => setProfileId(event.target.value)}
        disabled={pending || profiles.length === 0}
        aria-label={`Profil de limites de ${organization.name}`}
      >
        <option value="">— Aucun profil —</option>
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
            {profile.active ? "" : " (inactif)"}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn small"
        disabled={pending || profileId === ""}
        onClick={() => void apply()}
      >
        {pending ? "Application…" : "Appliquer"}
      </button>
    </div>
  );
}

type OrganizationRow = Organization & { membersCount?: number };

export function OrganizationsAdminTable({
  initialOrganizations,
  isSuperAdmin,
  activeOrganizationId,
  onOpenMembers,
}: {
  initialOrganizations: OrganizationRow[];
  isSuperAdmin: boolean;
  activeOrganizationId: string | null;
  onOpenMembers?: (organizationId: string) => void;
}) {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrganizationRow[]>(initialOrganizations);
  const [creating, setCreating] = useState(false);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let active = true;
    void fetch("/api/platform/limit-profiles", { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json()) as { profiles?: ProfileOption[]; error?: string };
        if (!response.ok) throw new Error(json.error ?? "Profils indisponibles");
        if (active) setProfiles(json.profiles ?? []);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Profils indisponibles");
      });
    return () => {
      active = false;
    };
  }, [isSuperAdmin]);

  const refresh = (): void => {
    router.refresh();
  };

  const setSuspended = async (organization: Organization, suspended: boolean): Promise<void> => {
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${organization.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Action impossible");
        return;
      }
      setOrganizations((current) =>
        current.map((item) =>
          item.id === organization.id
            ? { ...item, suspendedAt: suspended ? new Date().toISOString() : null }
            : item,
        ),
      );
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  return (
    <div>
      {error !== null ? <p className="alert error">{error}</p> : null}
      {isSuperAdmin ? (
        <div className="tools" style={{ marginBottom: "1.5rem" }}>
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            Nouvelle organisation
          </button>
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="table table-cards">
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Statut</th>
              <th>Membres</th>
              {isSuperAdmin ? <th>Limitation</th> : null}
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {organizations.map((organization) => (
              <tr key={organization.id}>
                <td data-label="Organisation">
                  <strong>{organization.name}</strong>
                  {organization.id === activeOrganizationId ? (
                    <span className="badge" style={{ marginLeft: "0.5rem" }}>
                      active
                    </span>
                  ) : null}
                </td>
                <td data-label="Statut">
                  <span className={`badge ${organization.suspendedAt === null ? "" : "orange"}`}>
                    {organization.suspendedAt === null ? "active" : "suspendue"}
                  </span>
                </td>
                <td data-label="Membres">
                  {onOpenMembers === undefined ? (
                    (organization.membersCount ?? "—")
                  ) : (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onOpenMembers(organization.id)}
                    >
                      {organization.membersCount ?? 0}
                    </button>
                  )}
                </td>
                {isSuperAdmin ? (
                  <td data-label="Limitation">
                    <LimitProfileCell
                      organization={organization}
                      profiles={profiles}
                      onApplied={(organizationId, profileId) => {
                        setOrganizations((current) =>
                          current.map((item) =>
                            item.id === organizationId
                              ? { ...item, limitProfileId: profileId }
                              : item,
                          ),
                        );
                        router.refresh();
                      }}
                      onError={setError}
                    />
                  </td>
                ) : null}
                <td data-label="Actions" className="cell-actions">
                  {isSuperAdmin ? (
                    <button
                      type="button"
                      className={`btn small ${organization.suspendedAt === null ? "danger ghost" : ""}`}
                      onClick={() =>
                        void setSuspended(organization, organization.suspendedAt === null)
                      }
                    >
                      {organization.suspendedAt === null ? "Suspendre" : "Réactiver"}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {organizations.length === 0 ? (
              <tr>
                <td colSpan={isSuperAdmin ? 5 : 4}>Aucune organisation.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {isSuperAdmin && creating ? (
        <Modal title="Nouvelle organisation" onClose={() => setCreating(false)}>
          <OrganizationForm
            onCreated={() => {
              setCreating(false);
              refresh();
            }}
            onClose={() => setCreating(false)}
          />
        </Modal>
      ) : null}
    </div>
  );
}
