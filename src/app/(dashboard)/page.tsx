import Link from "next/link";
import { redirect } from "next/navigation";
import { countConversations } from "@/application/use-cases/conversations/list-conversations";
import { listFiches } from "@/application/use-cases/fiche/manage-fiches";
import { listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { listProspects } from "@/application/use-cases/prospects/list-prospects";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

/** Un lien est expiré dès que sa date d'expiration est atteinte. */
function isExpired(expiresAt: string | null, now: number): boolean {
  return expiresAt !== null && new Date(expiresAt).getTime() <= now;
}

/** Vue globale : indicateurs clés de la prospection. */
export default async function DashboardHomePage() {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }

  if (context.actor.organizationId === null) {
    return (
      <section>
        <span className="eyebrow">Vue globale</span>
        <h1 className="text-title">Aucune organisation active</h1>
        <p className="hint">
          Votre compte n&apos;est rattaché à aucune organisation. Contactez le super-administrateur
          de la plateforme pour être rattaché.
        </p>
      </section>
    );
  }
  if (context.actor.organizationSuspended === true) {
    return (
      <section>
        <span className="eyebrow">Vue globale</span>
        <h1 className="text-title">Organisation suspendue</h1>
        <p className="hint">
          L&apos;organisation <strong>{context.organization?.name ?? "—"}</strong> est suspendue.
          Aucune donnée métier n&apos;est accessible. Contactez le super-administrateur.
        </p>
      </section>
    );
  }

  const pool = getPool();
  const [prospects, fiches, links, conversations] = await Promise.all([
    listProspects({ prospects: pgProspectRepository(pool) }, context.actor),
    listFiches({ fiches: pgFicheRepository(pool) }, context.actor),
    listChatLinks({ links: pgChatLinkRepository(pool) }, context.actor),
    countConversations({ conversations: pgConversationRepository(pool) }, context.actor),
  ]);

  const now = Date.now();
  const linksActifs = links.filter((link) => link.actif && !isExpired(link.expiresAt, now)).length;
  const liensExpires = links.filter((link) => isExpired(link.expiresAt, now)).length;

  const stats = [
    { href: "/prospects", label: "Prospects", value: prospects.length, warn: false },
    {
      href: "/conversations?filtre=en_cours",
      label: "Conversations en cours",
      value: conversations.enCours,
      warn: false,
    },
    {
      href: "/conversations?filtre=finalisees",
      label: "Conversations finalisées",
      value: conversations.finalisees,
      warn: false,
    },
    { href: "/fiches", label: "Fiches", value: fiches.length, warn: false },
    { href: "/liens", label: "Liens actifs", value: linksActifs, warn: false },
    { href: "/liens", label: "Liens expirés", value: liensExpires, warn: true },
  ] as const;

  return (
    <section>
      <span className="eyebrow">Vue globale</span>
      <h1 className="text-title">Votre cockpit de prospection</h1>
      <p className="hint" style={{ fontSize: "1.05rem", marginTop: "1rem" }}>
        Connecté en tant que <strong>{context.user.email}</strong> — organisation{" "}
        <span className="badge">{context.organization?.name ?? "—"}</span> · rôle{" "}
        <span className="badge">
          {context.actor.isSuperAdmin ? "super-admin" : (context.role ?? "lecteur")}
        </span>
        .
      </p>

      <div className="stats-grid">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className={`stat-card${stat.warn ? " warn" : ""}`}
          >
            <span className="stat-label">{stat.label}</span>
            <span className="stat-value">{stat.value}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
