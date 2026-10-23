import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { NO_ORGANIZATION_PATH } from "@/domain/session";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
};

/** Coquille du dashboard : garde d'authentification + contexte tenant (ADR-0025). */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (context.user.mustChangePassword) {
    redirect("/change-password");
  }

  const organizations = pgOrganizationRepository(getPool());
  const list = context.actor.isSuperAdmin
    ? await organizations.listAll()
    : await organizations.listForUser(context.user.id);

  // État « aucune organisation » : l'utilisateur doit être rattaché.
  if (context.actor.organizationId === null) {
    if (!context.actor.isSuperAdmin) {
      redirect(NO_ORGANIZATION_PATH);
    }
  }

  return (
    <div className="dash">
      <DashboardHeader
        key={`${context.actor.organizationId ?? "none"}:${context.role ?? "none"}`}
        role={context.role ?? "lecteur"}
        email={context.user.email}
        organizations={list.map((organization) => ({
          id: organization.id,
          name: organization.name,
        }))}
        activeOrganizationId={context.actor.organizationId}
        organizationName={context.organization?.name ?? null}
        isSuperAdmin={context.actor.isSuperAdmin}
      />
      <main className="wrap dashboard-main">{children}</main>
    </div>
  );
}
