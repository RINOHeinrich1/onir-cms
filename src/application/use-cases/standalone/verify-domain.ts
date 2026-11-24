import { ValidationError } from "@/application/errors";
import type { StandaloneDnsResolver } from "@/application/ports/standalone-dns";
import type {
  StandaloneDomain,
  StandaloneRepository,
} from "@/application/ports/standalone-repository";
import { normalizeStandaloneHostname } from "@/domain/standalone";

export type VerifyStandaloneDomainDependencies = {
  domains: Pick<StandaloneRepository, "findDomain" | "setDomainVerification">;
  dns: StandaloneDnsResolver;
  /** Cible CNAME attendue pour les domaines personnalisés. */
  edgeHostname?: string;
  edgeIps?: string[];
};

export function standaloneVerificationRecord(hostname: string): string {
  return `_onir-verify.${normalizeStandaloneHostname(hostname)}`;
}

export function standaloneVerificationValue(token: string): string {
  return `onir-verification=${token}`;
}

function normalizeDnsTarget(value: string): string {
  return normalizeStandaloneHostname(value);
}

/**
 * Vérifie la propriété d'un domaine puis le CNAME vers l'edge.
 * Un sous-domaine plateforme est considéré vérifié sans TXT.
 */
export async function verifyStandaloneDomain(
  deps: VerifyStandaloneDomainDependencies,
  input: { domainId: string },
): Promise<StandaloneDomain> {
  const domain = await deps.domains.findDomain(input.domainId);
  if (domain === null) throw new ValidationError("Domaine introuvable");
  if (domain.verificationStatus === "verified") return domain;

  await deps.domains.setDomainVerification({
    id: domain.id,
    status: "verifying",
    lastError: null,
  });

  try {
    if (domain.kind === "custom_domain") {
      if (domain.verificationToken === null || domain.verificationToken === "") {
        throw new Error("Jeton de vérification absent");
      }
      const records = await deps.dns.resolveTxt(standaloneVerificationRecord(domain.hostname));
      const values = records.map((chunks) => chunks.join("")).map((value) => value.trim());
      const expected = standaloneVerificationValue(domain.verificationToken);
      if (!values.includes(expected)) {
        throw new Error("Enregistrement TXT de vérification absent ou incorrect");
      }

      if (deps.edgeHostname !== undefined && deps.edgeHostname.trim() !== "") {
        const targets = await deps.dns.resolveCname(domain.hostname).catch(() => []);
        const expectedEdge = normalizeDnsTarget(deps.edgeHostname);
        let routed = targets.map(normalizeDnsTarget).some((target) => target === expectedEdge);
        if (!routed && (deps.edgeIps?.length ?? 0) > 0) {
          const addresses = [
            ...(await deps.dns.resolve4(domain.hostname).catch(() => [] as string[])),
            ...(await deps.dns.resolve6(domain.hostname).catch(() => [] as string[])),
          ].map(normalizeDnsTarget);
          routed = addresses.some((address) => (deps.edgeIps ?? []).includes(address));
        }
        if (!routed) {
          throw new Error(
            `Routage DNS absent : CNAME vers ${expectedEdge} ou A/AAAA vers l'edge attendu`,
          );
        }
      }
    }

    return await deps.domains.setDomainVerification({
      id: domain.id,
      status: "verified",
      lastError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vérification DNS impossible";
    await deps.domains.setDomainVerification({
      id: domain.id,
      status: "failed",
      lastError: message,
    });
    throw error;
  }
}
