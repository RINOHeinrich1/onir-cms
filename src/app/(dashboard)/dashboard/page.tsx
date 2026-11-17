import Link from "next/link";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { getDashboardAiUsage } from "@/application/use-cases/ai/get-dashboard-ai-usage";
import { resolveConversationLinkScope } from "@/application/use-cases/chat-operators/resolve-chat-scope";
import { countConversations } from "@/application/use-cases/conversations/list-conversations";
import { listFiches } from "@/application/use-cases/fiche/manage-fiches";
import { listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { getExpirationAlertDays } from "@/application/use-cases/organizations/manage-organization-settings";
import { listProspects } from "@/application/use-cases/prospects/list-prospects";
import { DashboardAiUsageCard } from "@/components/dashboard/DashboardAiUsageCard";
import { ROLE_LABELS } from "@/domain/entities/user";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgConversationIncidentRepository } from "@/infrastructure/db/conversation-incident-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { pgOrganizationAiQuotaRepository } from "@/infrastructure/db/organization-ai-quota-repository";
import { pgOrganizationSettingsRepository } from "@/infrastructure/db/organization-settings-repository";
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
  if (!actorCan(context.actor, "dashboard:view")) {
    redirect("/conversations");
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
  const canIntervene = actorCan(context.actor, "conversations:intervene");
  const allowedLinkIds = canIntervene
    ? await resolveConversationLinkScope(pgChatOperatorScopeRepository(pool), context.actor)
    : [];
  const incidents = pgConversationIncidentRepository(pool);
  const [
    prospects,
    fiches,
    links,
    conversations,
    aiErrors,
    ficheErrors,
    expirationAlertDays,
    aiUsage,
  ] = await Promise.all([
    listProspects({ prospects: pgProspectRepository(pool) }, context.actor),
    listFiches({ fiches: pgFicheRepository(pool) }, context.actor),
    listChatLinks({ links: pgChatLinkRepository(pool) }, context.actor),
    countConversations({ conversations: pgConversationRepository(pool) }, context.actor),
    canIntervene
      ? incidents.countOpenUnhandledByKind(
          context.actor.organizationId,
          "ai_reply_failed",
          allowedLinkIds,
        )
      : Promise.resolve(0),
    canIntervene
      ? incidents.countOpenUnhandledByKind(
          context.actor.organizationId,
          "fiche_generation_failed",
          allowedLinkIds,
        )
      : Promise.resolve(0),
    getExpirationAlertDays(
      { settings: pgOrganizationSettingsRepository(pool) },
      context.actor.organizationId,
    ),
    getDashboardAiUsage({ quotas: pgOrganizationAiQuotaRepository(pool) }, context.actor),
  ]);

  const now = Date.now();
  const linksActifs = links.filter((link) => link.actif && !isExpired(link.expiresAt, now)).length;
  const liensExpires = links.filter((link) => isExpired(link.expiresAt, now)).length;
  const expirationLimit = now + expirationAlertDays * 24 * 60 * 60 * 1000;
  const liensProches =
    expirationAlertDays === 0
      ? 0
      : links.filter(
          (link) =>
            link.actif &&
            link.expiresAt !== null &&
            !isExpired(link.expiresAt, now) &&
            new Date(link.expiresAt).getTime() <= expirationLimit,
        ).length;

  const conversationMax = Math.max(conversations.enCours, conversations.finalisees, 1);
  const linksTotal = linksActifs + liensExpires;
  const activeLinksWidth = linksTotal === 0 ? 0 : (linksActifs / linksTotal) * 100;
  const expiredLinksWidth = linksTotal === 0 ? 0 : (liensExpires / linksTotal) * 100;
  const tokenFormatter = new Intl.NumberFormat("fr-FR");
  const globalQuotaLabel =
    aiUsage.budget === null || aiUsage.budget.maxTokens === null
      ? "∞ Illimité"
      : `${tokenFormatter.format(aiUsage.budget.tokensUsed)} / ${tokenFormatter.format(
          aiUsage.budget.maxTokens,
        )}`;
  const allocationLabel =
    aiUsage.allocations.length === 0
      ? "Aucun quota par modèle ou cluster configuré"
      : `${aiUsage.allocations.length} quota${aiUsage.allocations.length > 1 ? "s" : ""} configuré${
          aiUsage.allocations.length > 1 ? "s" : ""
        }`;
  const expirationSubtitle =
    expirationAlertDays === 0
      ? "Alerte désactivée"
      : `Dans les ${expirationAlertDays} prochains jours`;

  const barWidth = (value: number, max: number): number =>
    max <= 0 ? 0 : Math.round((value / max) * 100);

  return (
    <section className="dash-overview">
      <header className="dash-overview-head">
        <div>
          <span className="eyebrow">Vue globale</span>
          <h1 className="text-title">Observabilité générale</h1>
        </div>
        <span className="dash-active-pill">
          <i aria-hidden="true" />
          Organisation active
        </span>
      </header>

      <div className="dash-overview-grid">
        <section className="dash-panel dash-prospection">
          <header className="dash-panel-head">
            <h2>Prospection</h2>
            <span className="dash-tag">Vue globale</span>
          </header>
          <div className="dash-panel-body">
            <span className="dash-metric-label">Prospects enregistrés</span>
            <Link className="dash-big-metric" href="/prospects">
              {prospects.length}
              <small>prospects</small>
            </Link>
            <Link className="dash-spotlight" href="/leads">
              <span>
                <span className="dash-spotlight-label">Leads</span>
                <strong>{fiches.length}</strong>
                <small className="dash-spotlight-note">Fiches qualifiées</small>
              </span>
              <span className="dash-spotlight-arrow" aria-hidden="true">
                ↗
              </span>
            </Link>
            <p className="dash-note">
              Suivez vos prospects et vos fiches créées à partir des échanges.
            </p>
          </div>
        </section>

        <section className="dash-panel">
          <header className="dash-panel-head">
            <h2>Conversations</h2>
            <span className="dash-tag">Par statut</span>
          </header>
          <div className="dash-panel-body">
            <div className="dash-metric-pair">
              <Link href="/conversations?filtre=en_cours" className="dash-pair-item">
                <strong>{conversations.enCours}</strong>
                <span>En cours</span>
              </Link>
              <Link href="/conversations?filtre=finalisees&grouper=0" className="dash-pair-item">
                <strong>{conversations.finalisees}</strong>
                <span>Finalisées</span>
              </Link>
            </div>
            <div className="dash-compare">
              <span className="dash-compare-title">Comparaison des volumes</span>
              <div className="dash-bar-row">
                <span>En cours</span>
                <span className="dash-bar-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${barWidth(conversations.enCours, conversationMax)}%`,
                    }}
                  />
                </span>
                <strong>{conversations.enCours}</strong>
              </div>
              <div className="dash-bar-row">
                <span>Finalisées</span>
                <span className="dash-bar-track" aria-hidden="true">
                  <span
                    className="is-accent-2"
                    style={{
                      width: `${barWidth(conversations.finalisees, conversationMax)}%`,
                    }}
                  />
                </span>
                <strong>{conversations.finalisees}</strong>
              </div>
            </div>
            <p className="dash-note">Les barres comparent les comptes, sans tendance temporelle.</p>
          </div>
        </section>

        <DashboardAiUsageCard usage={aiUsage} />

        <section className="dash-panel">
          <header className="dash-panel-head">
            <h2>Liens de conversation</h2>
            <span className="dash-tag">Disponibilité</span>
          </header>
          <div className="dash-panel-body">
            <div className="dash-metric-pair">
              <Link href="/liens" className="dash-pair-item">
                <strong>{linksActifs}</strong>
                <span>Liens actifs</span>
              </Link>
              <Link href="/liens" className="dash-pair-item">
                <strong>{liensExpires}</strong>
                <span>Liens expirés</span>
              </Link>
            </div>
            <div className="dash-stack-bar" aria-hidden="true">
              <span className="dash-stack-active" style={{ width: `${activeLinksWidth}%` }} />
              <span className="dash-stack-expired" style={{ width: `${expiredLinksWidth}%` }} />
            </div>
            <div className="dash-legend">
              <span>
                <i className="is-active" aria-hidden="true" />
                Actifs
              </span>
              <span>
                <i className="is-expired" aria-hidden="true" />
                Expirés
              </span>
            </div>
            <p className="dash-note">Comparez les liens actifs et expirés de votre organisation.</p>
          </div>
        </section>

        <section className="dash-panel">
          <header className="dash-panel-head">
            <h2>Qualité opérationnelle</h2>
            <span className="dash-tag">À surveiller</span>
          </header>
          <div className="dash-panel-body">
            <div className="dash-status-list">
              <Link
                className={`dash-status-row${aiErrors > 0 ? " is-warn" : ""}`}
                href="/conversations?filtre=toutes&incident=ai_reply_failed&prise_en_main=non"
              >
                <span>Conversations IA en erreur</span>
                <strong>{aiErrors}</strong>
              </Link>
              <Link
                className={`dash-status-row${ficheErrors > 0 ? " is-warn" : ""}`}
                href="/conversations?filtre=toutes&incident=fiche_generation_failed&prise_en_main=non"
              >
                <span>Générations de fiche en erreur</span>
                <strong>{ficheErrors}</strong>
              </Link>
            </div>
            <p className="dash-note">Les erreurs de génération nécessitent une vérification.</p>
          </div>
        </section>

        <section className="dash-panel">
          <header className="dash-panel-head">
            <h2>Échéances & quotas</h2>
            <span className="dash-tag">Configuration</span>
          </header>
          <div className="dash-panel-body">
            <Link className="dash-status-row" href="/liens">
              <span>
                Chatbots proches d’expiration
                <small>{expirationSubtitle}</small>
              </span>
              <strong>{expirationAlertDays === 0 ? "—" : liensProches}</strong>
            </Link>
            <div className="dash-quota-lines">
              <div className="dash-quota-line">
                <span className="badge">Quota global</span>
                <span>{globalQuotaLabel}</span>
              </div>
              <div className="dash-quota-line">
                <span className="badge muted">Modèles / clusters</span>
                <span>{allocationLabel}</span>
              </div>
            </div>
            <p className="dash-note">Les échéances suivent la règle d’alerte configurée.</p>
          </div>
        </section>
      </div>

      <div className="dashboard-lower">
        <section className="card dashboard-actions">
          <h2>Actions rapides</h2>
          <div className="dashboard-action-list">
            <Link href="/liens">
              <strong>Configurer un chatbot</strong>
              <span>Créer un lien, choisir son modèle et ses quotas.</span>
            </Link>
            <Link href="/prospects">
              <strong>Ajouter un prospect</strong>
              <span>Compléter une fiche ou consulter la vue 360°.</span>
            </Link>
            <Link href="/conversations">
              <strong>Traiter les conversations</strong>
              <span>Répondre, prendre la main ou générer une fiche.</span>
            </Link>
            <Link href="/configuration?tab=ia">
              <strong>Régler l’IA</strong>
              <span>Fournisseur par défaut, extraction et modèles.</span>
            </Link>
          </div>
        </section>
        <section className="card dashboard-context">
          <h2>Votre espace</h2>
          <p>
            Organisation <strong>{context.organization?.name ?? "—"}</strong>
          </p>
          <p>
            Rôle{" "}
            <strong>
              {context.actor.isSuperAdmin ? "super-admin" : ROLE_LABELS[context.role ?? "lecteur"]}
            </strong>
          </p>
          <p>
            Connecté en tant que <strong>{context.user.email}</strong>
          </p>
          <p className="hint">
            Les indicateurs sont propres à votre organisation et à votre périmètre.
          </p>
          <Link className="btn ghost small" href="/configuration">
            Ouvrir la configuration
          </Link>
        </section>
      </div>
    </section>
  );
}
