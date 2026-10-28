"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MemberDto } from "@/application/use-cases/organizations/manage-members";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { Organization } from "@/domain/entities/organization";
import { MembersTable } from "./MembersTable";
import { OrganizationForm } from "./OrganizationForm";

type OrganizationWithMembers = Organization & { members: MemberDto[] };

/** Liste des organisations accessibles : statut, membres, suspension. */
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
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const refresh = (): void => {
    router.refresh();
    setOrganizations((current) => current);
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

  const selected = organizations.find((organization) => organization.id === selectedId) ?? null;

  return (
    <div>
      {error !== null ? <p className="alert error">{error}</p> : null}
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
                <td data-label="Membres">{organization.members.length}</td>
                <td data-label="Actions" className="cell-actions">
                  <div className="tools">
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => setSelectedId(organization.id)}
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
                <td colSpan={4}>Aucune organisation.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected !== null ? (
        <section style={{ marginTop: "2rem" }}>
          <h3>Membres — {selected.name}</h3>
          <MembersTable
            key={`${selected.id}:${selected.members.length}`}
            organizationId={selected.id}
            initialMembers={selected.members}
          />
        </section>
      ) : null}
    </div>
  );
}
