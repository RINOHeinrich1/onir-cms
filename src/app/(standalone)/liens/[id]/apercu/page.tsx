import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import {
  buildLinkContext,
  type LinkTemplateDependencies,
  loadTemplateSpec,
} from "@/application/use-cases/visual-templates/link-template";
import { listVisualTemplates } from "@/application/use-cases/visual-templates/manage-visual-templates";
import { LinkDisplaySettings } from "@/components/links/LinkDisplaySettings";
import type { VisualTemplateOption } from "@/components/links/types";
import { TemplateHost } from "@/components/templates/TemplateHost";
import {
  type ChatLinkChannel,
  type ChatLinkSurface,
  channelsForLink,
  parseVisualTemplateParams,
} from "@/domain/entities/chat";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { getPool } from "@/infrastructure/db/pool";
import { tryTemplateDataDependencies } from "@/infrastructure/db/template-data-runtime";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paramètres d’affichage",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function requestedSurface(value: string | string[] | undefined): ChatLinkSurface | null {
  return value === "page" || value === "widget" ? value : null;
}

function decodeParamsOverride(value: string): unknown {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

function decodeTemplateOverride(
  value: string | string[] | undefined,
): { id: string; version: string } | null {
  if (typeof value !== "string" || value === "") return null;
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  return { id: value.slice(0, at), version: value.slice(at + 1) };
}

async function loadVisualTemplateOptions(
  actor: Parameters<typeof listVisualTemplates>[1],
  pool: ReturnType<typeof getPool>,
): Promise<VisualTemplateOption[]> {
  const repository = pgVisualTemplateRepository(pool);
  const templates = await listVisualTemplates({ templates: repository }, actor);
  return Promise.all(
    templates.map(async (item) => ({
      id: item.id,
      key: item.key,
      name: item.name,
      versions: (await repository.listVersions(item.id)).map((version) => ({
        version: version.version,
        params: version.manifest.params,
        widget: version.manifest.ui.widget?.display ?? null,
      })),
    })),
  );
}

export default async function ApercuLinkPage({ params, searchParams }: PageProps) {
  const sessionContext = await getSessionContext();
  if (sessionContext === null) redirect("/login");
  if (!actorCan(sessionContext.actor, "links:list")) redirect("/dashboard");

  const { id } = await params;
  const query = await searchParams;
  const pool = getPool();
  const organizationId = sessionContext.actor.organizationId;
  if (organizationId === null) notFound();

  const link = await pgChatLinkRepository(pool).findById(organizationId, id);
  if (link === null) notFound();

  const channels = channelsForLink(link);
  const visualTemplates = await loadVisualTemplateOptions(sessionContext.actor, pool);
  const canEdit = actorCan(sessionContext.actor, "links:update");
  const requested = requestedSurface(query.surface);
  const fallbackSurface: ChatLinkSurface = channels.page.enabled
    ? "page"
    : channels.widget.enabled
      ? "widget"
      : "page";

  if (query.embed !== "1") {
    return (
      <main className="wrap dashboard-main">
        <LinkDisplaySettings
          link={link}
          visualTemplates={visualTemplates}
          canEdit={canEdit}
          initialSurface={requested ?? fallbackSurface}
        />
      </main>
    );
  }

  const surface = requested ?? fallbackSurface;
  const baseChannel = channels[surface];
  const templateOverride = decodeTemplateOverride(query.template);
  const selectedTemplate =
    templateOverride === null
      ? null
      : (visualTemplates.find(
          (item) =>
            item.id === templateOverride.id &&
            item.versions.some((version) => version.version === templateOverride.version),
        ) ?? null);
  const paramsOverride =
    typeof query.params === "string" ? decodeParamsOverride(query.params) : undefined;
  const channel: ChatLinkChannel =
    selectedTemplate === null
      ? baseChannel
      : {
          ...baseChannel,
          visualTemplateId: selectedTemplate.id,
          visualTemplateVersion: templateOverride?.version ?? null,
          visualTemplateParams:
            paramsOverride === undefined
              ? baseChannel.visualTemplateParams
              : parseVisualTemplateParams(paramsOverride),
        };

  const deps: LinkTemplateDependencies = {
    visualTemplates: pgVisualTemplateRepository(pool),
    medias: pgMediaRepository(pool),
    configs: pgChatbotConfigRepository(pool),
  };
  const spec = await loadTemplateSpec(deps, link, surface, channel);
  if (spec?.dataContracts.some((contract) => contract.loading === "eager")) {
    const dataDeps = await tryTemplateDataDependencies(pool);
    if (dataDeps !== undefined) deps.data = dataDeps;
  }

  let consent: { texte: string; lien: string } | null = null;
  if (surface === "page" && channel.confidentialiteId !== null) {
    const policy = await pgConfidentialiteRepository(pool).findById(
      organizationId,
      channel.confidentialiteId,
    );
    if (policy?.actif === true) consent = { texte: policy.texte, lien: policy.lien };
  }

  const context =
    spec === null
      ? null
      : await buildLinkContext(deps, link, spec, {
          phase: surface === "widget" ? "chat" : "identity",
          messages: [],
          consent: surface === "widget" ? null : consent,
          surface,
          channel,
        });

  return (
    <main className={`display-preview-bare display-preview-bare--${surface}`}>
      {spec === null || context === null ? (
        <section className="card" style={{ maxWidth: "34rem", margin: "1.5rem auto" }}>
          <h2>Aucun template visuel rattaché</h2>
          <p className="hint">
            Ce lien utilise l’interface par défaut. Choisissez un template dans les paramètres
            d’affichage.
          </p>
        </section>
      ) : (
        <TemplateHost
          token="apercu"
          template={spec}
          baseContext={context}
          conversationId={null}
          initialMessages={[]}
          anonymous={surface === "widget" && link.type === "standard"}
          preview
        />
      )}
    </main>
  );
}
