import { ValidationError } from "@/application/errors";
import type {
  StandaloneDomain,
  StandaloneRepository,
} from "@/application/ports/standalone-repository";
import type { StandaloneTlsManager } from "@/application/ports/standalone-tls";

export type IssueStandaloneCertificateDependencies = {
  domains: Pick<StandaloneRepository, "findDomain" | "setDomainSsl">;
  tls: StandaloneTlsManager;
};

/** Émet le certificat d'un domaine vérifié et met à jour son état SSL. */
export async function issueStandaloneCertificate(
  deps: IssueStandaloneCertificateDependencies,
  input: { domainId: string },
): Promise<StandaloneDomain> {
  const domain = await deps.domains.findDomain(input.domainId);
  if (domain === null) throw new ValidationError("Domaine introuvable");
  if (domain.verificationStatus !== "verified") {
    throw new ValidationError("Le domaine doit être vérifié avant l'émission TLS");
  }
  if (domain.sslStatus === "active") return domain;

  await deps.domains.setDomainSsl({
    id: domain.id,
    status: "issuing",
    lastError: null,
  });

  try {
    await deps.tls.issue({ hostname: domain.hostname });
    return await deps.domains.setDomainSsl({
      id: domain.id,
      status: "active",
      lastError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Émission TLS impossible";
    await deps.domains.setDomainSsl({
      id: domain.id,
      status: "failed",
      lastError: message,
    });
    throw error;
  }
}
