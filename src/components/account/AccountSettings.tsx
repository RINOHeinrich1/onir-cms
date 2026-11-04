"use client";

import Link from "next/link";
import { useState } from "react";
import type { MemberDto } from "@/application/use-cases/organizations/manage-members";
import { ApiKeysPanel } from "@/components/api-keys/ApiKeysPanel";
import { ExpirationAlertSettings } from "@/components/configuration/ExpirationAlertSettings";
import {
  type InvitationDto,
  InvitationsManager,
} from "@/components/invitations/InvitationsManager";
import { LimitProfilesManager } from "@/components/limit-profiles/LimitProfilesManager";
import { MembersTable } from "@/components/organizations/MembersTable";
import { OrganizationsAdminTable } from "@/components/organizations/OrganizationsAdminTable";
import type { ApiKey } from "@/domain/entities/api-key";
import type { Organization } from "@/domain/entities/organization";
import { ROLE_LABELS, type Role } from "@/domain/entities/user";

type AccountTab = "compte" | "organisation" | "utilisateurs" | "acces-api" | "profils";
type PeopleTab = "membres" | "invitations";
type OrganizationWithMembers = Organization & { members: MemberDto[] };

export function AccountSettings({
  email,
  role,
  organizationName,
  activeOrganizationId,
  isSuperAdmin,
  initialTab,
  initialPeopleTab,
  initialOrganizationId,
  organizations,
  invitations,
  apiKeys,
  canOrganizations,
  canUsers,
  canInvitations,
  canApiKeys,
  expirationAlertDays,
}: {
  email: string;
  role: Role | null;
  organizationName: string | null;
  activeOrganizationId: string | null;
  isSuperAdmin: boolean;
  initialTab: AccountTab;
  initialPeopleTab: PeopleTab;
  initialOrganizationId: string | null;
  organizations: OrganizationWithMembers[];
  invitations: InvitationDto[];
  apiKeys: ApiKey[];
  canOrganizations: boolean;
  canUsers: boolean;
  canInvitations: boolean;
  canApiKeys: boolean;
  expirationAlertDays: number | null;
}) {
  const tabs: { id: AccountTab; label: string }[] = [
    { id: "compte", label: "Mon compte" },
    ...(canOrganizations ? [{ id: "organisation" as const, label: "Organisation" }] : []),
    ...(canUsers || canInvitations ? [{ id: "utilisateurs" as const, label: "Utilisateurs" }] : []),
    ...(canApiKeys ? [{ id: "acces-api" as const, label: "Accès API" }] : []),
    ...(isSuperAdmin ? [{ id: "profils" as const, label: "Profils de limites" }] : []),
  ];
  const allowedTabs = new Set(tabs.map((entry) => entry.id));
  const [tab, setTab] = useState<AccountTab>(allowedTabs.has(initialTab) ? initialTab : "compte");
  const [peopleTab, setPeopleTab] = useState<PeopleTab>(initialPeopleTab);
  const initialSelected =
    organizations.find((organization) => organization.id === initialOrganizationId)?.id ??
    organizations.find((organization) => organization.id === activeOrganizationId)?.id ??
    organizations[0]?.id ??
    null;
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(
    initialSelected,
  );
  const selectedOrganization =
    organizations.find((organization) => organization.id === selectedOrganizationId) ?? null;
  const activeOrganization =
    organizations.find((organization) => organization.id === activeOrganizationId) ?? null;

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Compte</span>
          <h1 className="text-title">Paramètres du compte</h1>
          <p className="muted-text">
            Compte, organisation, utilisateurs et accès API réunis dans un seul espace.
          </p>
        </div>
      </div>

      <div className="org-tabs channel-tabs" role="tablist" aria-label="Paramètres du compte">
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

      {tab === "compte" ? (
        <section className="card">
          <h3>Mon compte</h3>
          <div className="grid-2">
            <p>
              <span className="hint">Email</span>
              <br />
              <strong>{email}</strong>
            </p>
            <p>
              <span className="hint">Rôle</span>
              <br />
              <span className="badge">
                {isSuperAdmin ? "super-admin" : role === null ? "—" : ROLE_LABELS[role]}
              </span>
            </p>
            <p>
              <span className="hint">Organisation active</span>
              <br />
              <strong>{organizationName ?? "Aucune organisation"}</strong>
            </p>
          </div>
          <div className="tools" style={{ marginTop: "1.5rem" }}>
            <Link className="btn small" href="/change-password">
              Changer le mot de passe
            </Link>
          </div>
        </section>
      ) : null}

      {tab === "organisation" && canOrganizations ? (
        <>
          {expirationAlertDays !== null ? (
            <ExpirationAlertSettings
              initialDays={expirationAlertDays}
              organizationName={organizationName ?? "l’organisation active"}
            />
          ) : null}
          <OrganizationsAdminTable
            key={organizations.map((organization) => organization.id).join("|")}
            initialOrganizations={organizations.map((organization) => ({
              ...organization,
              membersCount: organization.members.length,
            }))}
            isSuperAdmin={isSuperAdmin}
            activeOrganizationId={activeOrganizationId}
            onOpenMembers={(organizationId) => {
              setSelectedOrganizationId(organizationId);
              setPeopleTab("membres");
              setTab("utilisateurs");
            }}
          />
        </>
      ) : null}

      {tab === "utilisateurs" && (canUsers || canInvitations) ? (
        <section>
          {organizations.length > 0 ? (
            <label className="field" style={{ maxWidth: "28rem" }}>
              Organisation
              <select
                value={selectedOrganizationId ?? ""}
                onChange={(event) => setSelectedOrganizationId(event.target.value || null)}
                disabled={!isSuperAdmin}
              >
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="hint">Aucune organisation accessible.</p>
          )}

          <div className="org-tabs channel-tabs" role="tablist" aria-label="Utilisateurs">
            <button
              type="button"
              role="tab"
              aria-selected={peopleTab === "membres"}
              className="channel-tab"
              onClick={() => setPeopleTab("membres")}
            >
              Membres
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={peopleTab === "invitations"}
              className="channel-tab"
              onClick={() => setPeopleTab("invitations")}
            >
              Invitations
            </button>
          </div>

          {peopleTab === "membres" ? (
            selectedOrganization === null ? (
              <p className="hint">Sélectionnez une organisation.</p>
            ) : (
              <>
                <h3>Membres — {selectedOrganization.name}</h3>
                <MembersTable
                  key={`${selectedOrganization.id}:${selectedOrganization.members.length}`}
                  organizationId={selectedOrganization.id}
                  initialMembers={selectedOrganization.members}
                />
              </>
            )
          ) : (
            <InvitationsManager
              key={selectedOrganizationId ?? "active"}
              initialInvitations={invitations}
              organizations={organizations.map((organization) => ({
                id: organization.id,
                name: organization.name,
              }))}
              isSuperAdmin={isSuperAdmin}
              activeOrganizationId={selectedOrganizationId ?? activeOrganizationId}
            />
          )}
        </section>
      ) : null}

      {tab === "acces-api" && canApiKeys ? (
        <section>
          <h3>Accès API</h3>
          <p className="hint">
            Clés de l’organisation active : <strong>{activeOrganization?.name ?? "—"}</strong>.
          </p>
          <ApiKeysPanel initialKeys={apiKeys} />
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
    </section>
  );
}

export type { AccountTab, PeopleTab };
