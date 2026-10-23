import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import {
  buildLinkContext,
  type LinkTemplateDependencies,
  loadTemplateSpec,
} from "@/application/use-cases/visual-templates/link-template";
import { TemplateHost } from "@/components/templates/TemplateHost";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { getPool } from "@/infrastructure/db/pool";
import { tryTemplateDataDependencies } from "@/infrastructure/db/template-data-runtime";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aperçu du template",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Décode `?params=` (base64url JSON) ; toute erreur ⇒ aucune surcharge. */
function decodeParamsOverride(value: string): unknown {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

/**
 * US-TEMPLATE-002 — aperçu d'un lien de chat **avec son template visuel**.
 * Rend le shell hôte en mode **simulation** (données locales, aucun appel API) :
 * l'équipe voit exactement l'interface du visiteur, sans créer de conversation.
 */
export default async function ApercuLinkPage({ params, searchParams }: PageProps) {
  const sessionContext = await getSessionContext();
  if (sessionContext === null) {
    redirect("/login");
  }
  if (!actorCan(sessionContext.actor, "links:list")) {
    redirect("/");
  }

  const { id } = await params;
  const query = await searchParams;
  const paramsOverride =
    typeof query.params === "string" ? decodeParamsOverride(query.params) : undefined;
  const pool = getPool();
  const organizationId = sessionContext.actor.organizationId;
  if (organizationId === null) {
    notFound();
  }
  const link = await pgChatLinkRepository(pool).findById(organizationId, id);
  if (link === null) {
    notFound();
  }

  const deps: LinkTemplateDependencies = {
    visualTemplates: pgVisualTemplateRepository(pool),
    medias: pgMediaRepository(pool),
    templates: pgChatTemplateRepository(pool),
  };
  const spec = await loadTemplateSpec(deps, link);
  if (spec?.dataContracts.some((contract) => contract.loading === "eager")) {
    const dataDeps = await tryTemplateDataDependencies(pool);
    if (dataDeps !== undefined) deps.data = dataDeps;
  }

  let consent: { texte: string; lien: string } | null = null;
  if (link.confidentialiteId !== null) {
    const policy = await pgConfidentialiteRepository(pool).findById(
      organizationId,
      link.confidentialiteId,
    );
    if (policy?.actif === true) consent = { texte: policy.texte, lien: policy.lien };
  }

  const context =
    spec === null
      ? null
      : await buildLinkContext(deps, link, spec, {
          phase: "identity",
          messages: [],
          consent,
          ...(paramsOverride === undefined ? {} : { paramsOverride }),
        });

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Aperçu</span>
          <h1 className="text-title">Aperçu du template visuel</h1>
          <p className="muted-text">
            Lien « {link.label === "" ? "sans nom" : link.label} » · simulation locale (aucune
            conversation créée)
          </p>
        </div>
        <div className="tools">
          <a className="btn ghost small" href="/liens">
            ← Liens
          </a>
        </div>
      </div>

      {spec === null || context === null ? (
        <section className="card" style={{ maxWidth: "34rem", margin: "1.5rem auto" }}>
          <h2>Aucun template visuel rattaché</h2>
          <p className="hint">
            Ce lien utilise l&apos;interface par défaut. Modifiez le lien pour lui rattacher un
            template visuel, puis revenez ici.
          </p>
        </section>
      ) : (
        <>
          <div className="preview-banner">
            Aperçu — template <strong>{spec.id}</strong>@{spec.version} ({spec.mode})
          </div>
          <div className="preview-frame">
            <TemplateHost
              token="apercu"
              template={spec}
              baseContext={context}
              conversationId={null}
              initialMessages={[]}
              preview
            />
          </div>
        </>
      )}
    </section>
  );
}
