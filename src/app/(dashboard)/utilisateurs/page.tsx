import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listUsers } from "@/application/use-cases/users/list-users";
import { UsersTable } from "@/components/users/UsersTable";
import { ROLE_LABELS } from "@/domain/entities/user";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
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
      operatorScopes: pgChatOperatorScopeRepository(pool),
    },
    context.actor,
  );
  const chatLinks =
    context.actor.organizationId === null
      ? []
      : (await pgChatLinkRepository(pool).list(context.actor.organizationId)).map((link) => ({
          id: link.id,
          label: link.label,
        }));

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Administration</span>
          <h1 className="text-title">Utilisateurs</h1>
          <p className="muted-text">
            Organisation active : <strong>{context.organization?.name ?? "—"}</strong> · rôle
            effectif{" "}
            <span className="badge">{context.role === null ? "—" : ROLE_LABELS[context.role]}</span>
          </p>
        </div>
      </div>
      <UsersTable
        initialUsers={users}
        canSetActif={context.actor.isSuperAdmin}
        organizationId={context.actor.organizationId}
        canAttachExisting={context.actor.isSuperAdmin}
        chatLinks={chatLinks}
      />
    </section>
  );
}
