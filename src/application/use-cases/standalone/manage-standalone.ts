import { randomBytes } from "node:crypto";
import { ConflictError, ValidationError } from "@/application/errors";
import type {
  StandaloneBuild,
  StandaloneDomain,
  StandaloneRepository,
} from "@/application/ports/standalone-repository";
import {
  canActivateStandaloneBuild,
  isValidStandaloneHostname,
  normalizeStandaloneHostname,
} from "@/domain/standalone";

/** Ajoute un domaine après validation et vérifie l'unicité globale. */
export async function addStandaloneDomain(
  repo: StandaloneRepository,
  input: {
    organizationId: string;
    chatLinkId: string;
    hostname: string;
    kind: "platform_subdomain" | "custom_domain";
  },
): Promise<StandaloneDomain> {
  const hostname = normalizeStandaloneHostname(input.hostname);
  if (!isValidStandaloneHostname(hostname)) {
    throw new ValidationError("Nom de domaine invalide");
  }
  const existing = await repo.findDomainByHostname(hostname);
  if (existing !== null) {
    throw new ConflictError("Ce domaine est déjà utilisé");
  }
  return repo.createDomain({
    organizationId: input.organizationId,
    chatLinkId: input.chatLinkId,
    hostname,
    kind: input.kind,
    verificationToken: randomBytes(16).toString("hex"),
  });
}

/** Active un build prêt sur un chatbot, après contrôle d'appartenance. */
export async function activateStandaloneBuild(
  repo: StandaloneRepository,
  input: {
    organizationId: string;
    chatLinkId: string;
    buildId: string;
  },
): Promise<StandaloneBuild> {
  const build = await repo.findBuild(input.buildId);
  if (
    build === null ||
    build.chatLinkId !== input.chatLinkId ||
    build.organizationId !== input.organizationId
  ) {
    throw new ValidationError("Build introuvable pour ce chatbot");
  }
  if (!canActivateStandaloneBuild(build.status)) {
    throw new ValidationError("Seul un build prêt peut être activé");
  }
  return repo.activateBuild(input);
}
