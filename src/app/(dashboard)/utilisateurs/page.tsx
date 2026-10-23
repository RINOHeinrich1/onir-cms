import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listUsers } from "@/application/use-cases/users/list-users";
import { UsersTable } from "@/components/users/UsersTable";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Utilisateurs",
};

/**
 * US-USERS-001 / ADR-0025 §5 — page Utilisateurs **scopée** : seuls les membres
 * de l'organisation active sont listés.
 */
export default async function UtilisateursPage() {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "users:list")) {
    redirect("/dashboard");
  }

  const pool = getPool();
  const users = await listUsers(
    {
      users: pgUserRepository(pool),
      memberships: pgMembershipRepository(pool),
    },
    context.actor,
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Administration</span>
          <h1 className="text-title">Utilisateurs</h1>
          <p className="muted-text">
            Organisation active : <strong>{context.organization?.name ?? "—"}</strong> · rôle
            effectif <span className="badge">{context.role ?? "—"}</span>
          </p>
        </div>
      </div>
      <UsersTable
        initialUsers={users}
        canSetActif={context.actor.isSuperAdmin}
        organizationId={context.actor.organizationId}
        canAttachExisting={context.actor.isSuperAdmin}
      />
    </section>
  );
}
