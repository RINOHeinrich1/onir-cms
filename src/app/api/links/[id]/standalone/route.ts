import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import {
  activateStandaloneBuild,
  addStandaloneDomain,
} from "@/application/use-cases/standalone/manage-standalone";
import {
  standaloneVerificationRecord,
  standaloneVerificationValue,
  verifyStandaloneDomain,
} from "@/application/use-cases/standalone/verify-domain";
import { channelsForLink } from "@/domain/entities/chat";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgStandaloneRepository } from "@/infrastructure/db/standalone-repository";
import { nodeStandaloneDnsResolver } from "@/infrastructure/dns/node-dns-resolver";
import { standaloneEdgeHostname } from "@/lib/env";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject, stringField } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

function configHashForPage(channel: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(channel)).digest("hex")}`;
}

async function loadState(
  actorOrganizationId: string,
  chatLinkId: string,
): Promise<{
  settings: Awaited<ReturnType<ReturnType<typeof pgStandaloneRepository>["findSettings"]>>;
  builds: Awaited<ReturnType<ReturnType<typeof pgStandaloneRepository>["listBuilds"]>>;
  domains: Awaited<ReturnType<ReturnType<typeof pgStandaloneRepository>["listDomains"]>>;
}> {
  const repo = pgStandaloneRepository(getPool());
  const [settings, builds, domains] = await Promise.all([
    repo.ensureSettings({ chatLinkId, organizationId: actorOrganizationId }),
    repo.listBuilds(chatLinkId),
    repo.listDomains(chatLinkId),
  ]);
  return { settings, builds, domains };
}

function publicState(state: Awaited<ReturnType<typeof loadState>>, edgeHostname: string) {
  return {
    settings: state.settings,
    builds: state.builds,
    domains: state.domains.map((domain) => ({
      ...domain,
      verificationRecord:
        domain.kind === "custom_domain" && domain.verificationToken !== null
          ? standaloneVerificationRecord(domain.hostname)
          : null,
      verificationValue:
        domain.kind === "custom_domain" && domain.verificationToken !== null
          ? standaloneVerificationValue(domain.verificationToken)
          : null,
      cnameTarget: domain.kind === "custom_domain" ? edgeHostname : null,
    })),
  };
}

/** GET /api/links/[id]/standalone — état builds/domaines du chatbot. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    if (actor.organizationId === null) throw new ValidationError("Organisation requise");
    const { id } = await context.params;
    const link = await pgChatLinkRepository(getPool()).findById(actor.organizationId, id);
    if (link === null) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    return NextResponse.json(
      publicState(await loadState(actor.organizationId, id), standaloneEdgeHostname()),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/links/[id]/standalone — actions de publication et de domaine. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    if (actor.organizationId === null) throw new ValidationError("Organisation requise");
    const { id } = await context.params;
    const link = await pgChatLinkRepository(getPool()).findById(actor.organizationId, id);
    if (link === null) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const action = stringField(body, "action");
    const repo = pgStandaloneRepository(getPool());

    if (action === "enable" || action === "disable") {
      await repo.setEnabled({
        chatLinkId: id,
        organizationId: actor.organizationId,
        enabled: action === "enable",
      });
    } else if (action === "build") {
      const page = channelsForLink(link).page;
      if (page.visualTemplateId === null || page.visualTemplateVersion === null) {
        throw new ValidationError("Aucun template visuel sur le canal page");
      }
      await repo.createBuild({
        organizationId: actor.organizationId,
        chatLinkId: id,
        templateId: page.visualTemplateId,
        templateVersion: page.visualTemplateVersion,
        configHash: configHashForPage(page),
        createdBy: actor.id,
      });
    } else if (action === "activate") {
      const buildId = stringField(body, "buildId");
      if (buildId === undefined) throw new ValidationError("Build manquant");
      await activateStandaloneBuild(repo, {
        organizationId: actor.organizationId,
        chatLinkId: id,
        buildId,
      });
      await repo.setEnabled({
        chatLinkId: id,
        organizationId: actor.organizationId,
        enabled: true,
      });
    } else if (action === "add-domain") {
      const hostname = stringField(body, "hostname");
      if (hostname === undefined) throw new ValidationError("Domaine manquant");
      await addStandaloneDomain(repo, {
        organizationId: actor.organizationId,
        chatLinkId: id,
        hostname,
        kind: "custom_domain",
      });
    } else if (action === "verify-domain") {
      const domainId = stringField(body, "domainId");
      if (domainId === undefined) throw new ValidationError("Domaine manquant");
      const domain = await repo.findDomain(domainId);
      if (domain === null || domain.chatLinkId !== id)
        throw new ValidationError("Domaine introuvable");
      await verifyStandaloneDomain(
        {
          domains: repo,
          dns: nodeStandaloneDnsResolver(),
          edgeHostname: standaloneEdgeHostname(),
        },
        { domainId },
      );
    } else if (action === "delete-domain") {
      const domainId = stringField(body, "domainId");
      if (domainId === undefined) throw new ValidationError("Domaine manquant");
      const domain = await repo.findDomain(domainId);
      if (domain === null || domain.chatLinkId !== id)
        throw new ValidationError("Domaine introuvable");
      await repo.deleteDomain(domainId);
    } else if (action === "primary-domain") {
      const domainId = stringField(body, "domainId");
      if (domainId === undefined) throw new ValidationError("Domaine manquant");
      const domain = await repo.findDomain(domainId);
      if (domain === null || domain.chatLinkId !== id)
        throw new ValidationError("Domaine introuvable");
      await repo.setPrimaryDomain({ chatLinkId: id, domainId });
    } else {
      throw new ValidationError("Action inconnue");
    }

    return NextResponse.json(
      publicState(await loadState(actor.organizationId, id), standaloneEdgeHostname()),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
