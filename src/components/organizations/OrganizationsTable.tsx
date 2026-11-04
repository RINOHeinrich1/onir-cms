"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MemberDto } from "@/application/use-cases/organizations/manage-members";
import { LimitProfilesManager } from "@/components/limit-profiles/LimitProfilesManager";
import { confirmDialog } from "@/components/ui/confirm";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { Organization } from "@/domain/entities/organization";
import { MembersTable } from "./MembersTable";
import { OrganizationForm } from "./OrganizationForm";

type OrganizationWithMembers = Organization & { members: MemberDto[] };
type ProfileOption = { id: string; name: string; active: boolean };
type Tab = "organisations" | "membres" | "profils";

function LimitProfileCell({
  organization,
  profiles,
  onApplied,
  onError,
}: {
  organization: OrganizationWithMembers;
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

export function OrganizationsTable({
  initialOrganizations,
  isSuperAdmin,
  activeOrganizationId,
}: {
  initialOrganizations: OrganizationWithMembers[];
  isSuperAdmin: boolean;
  activeOrganizationId: string | null;
}) {
  const router = useRouter();
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [selectedId, setSelectedId] = useState<string | null>(
    activeOrganizationId ?? initialOrganizations[0]?.id ?? null,
  );
  const [tab, setTab] = useState<Tab>("organisations");
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

  const openMembers = (organizationId: string): void => {
    setSelectedId(organizationId);
    setTab("membres");
  };

  const selected = organizations.find((organization) => organization.id === selectedId) ?? null;
  const tabs: { id: Tab; label: string }[] = isSuperAdmin
    ? [
        { id: "organisations", label: "Organisation" },
        { id: "membres", label: "Membres" },
        { id: "profils", label: "Profils de limites" },
      ]
    : [
        { id: "organisations", label: "Organisation" },
        { id: "membres", label: "Membres" },
      ];

  return (
    <div>
      {error !== null ? <p className="alert error">{error}</p> : null}

      <div className="org-tabs channel-tabs" role="tablist" aria-label="Gestion des organisations">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className="channel-tab"
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "organisations" ? (
        <>
          {isSuperAdmin ? (
            <div style={{ marginBottom: "1.5rem" }}>
              <OrganizationForm onCreated={refresh} />
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
                      <span
                        className={`badge ${organization.suspendedAt === null ? "" : "orange"}`}
                      >
                        {organization.suspendedAt === null ? "active" : "suspendue"}
                      </span>
                    </td>
                    <td data-label="Membres">{organization.members.length}</td>
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
                      <div className="tools">
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => openMembers(organization.id)}
                        >
                          Membres
                        </button>
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
                      </div>
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
        </>
      ) : null}

      {tab === "membres" ? (
        <section>
          {selected === null ? (
            <p className="hint">Sélectionnez une organisation dans l’onglet Organisation.</p>
          ) : (
            <>
              <h3>Membres — {selected.name}</h3>
              <MembersTable
                key={`${selected.id}:${selected.members.length}`}
                organizationId={selected.id}
                initialMembers={selected.members}
              />
            </>
          )}
        </section>
      ) : null}

      {tab === "profils" && isSuperAdmin ? (
        <section>
          <p className="hint">
            Les profils sont la source de vérité des limites et des accès IA. Toute modification est
            appliquée aux organisations liées.
          </p>
          <LimitProfilesManager />
        </section>
      ) : null}
    </div>
  );
}
