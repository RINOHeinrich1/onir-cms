/**
 * Domaine du build standalone et des domaines publics (ADR-0106).
 * Aucun couplage framework, base ou stockage.
 */

export const STANDALONE_BUILD_STATUSES = [
  "queued",
  "building",
  "ready",
  "failed",
  "active",
  "superseded",
] as const;

export type StandaloneBuildStatus = (typeof STANDALONE_BUILD_STATUSES)[number];

export const STANDALONE_DOMAIN_KINDS = ["platform_subdomain", "custom_domain"] as const;
export type StandaloneDomainKind = (typeof STANDALONE_DOMAIN_KINDS)[number];

export const STANDALONE_VERIFICATION_STATUSES = [
  "pending",
  "verifying",
  "verified",
  "failed",
] as const;

export type StandaloneVerificationStatus = (typeof STANDALONE_VERIFICATION_STATUSES)[number];

export const STANDALONE_SSL_STATUSES = [
  "pending",
  "issuing",
  "active",
  "failed",
  "expired",
] as const;

export type StandaloneSslStatus = (typeof STANDALONE_SSL_STATUSES)[number];

export function isStandaloneBuildStatus(value: string): value is StandaloneBuildStatus {
  return (STANDALONE_BUILD_STATUSES as readonly string[]).includes(value);
}

export function isStandaloneDomainKind(value: string): value is StandaloneDomainKind {
  return (STANDALONE_DOMAIN_KINDS as readonly string[]).includes(value);
}

export function isStandaloneVerificationStatus(
  value: string,
): value is StandaloneVerificationStatus {
  return (STANDALONE_VERIFICATION_STATUSES as readonly string[]).includes(value);
}

export function isStandaloneSslStatus(value: string): value is StandaloneSslStatus {
  return (STANDALONE_SSL_STATUSES as readonly string[]).includes(value);
}

const ACTIVE_BUILD_STATUS: StandaloneBuildStatus = "active";
const READY_BUILD_STATUS: StandaloneBuildStatus = "ready";

/** Un build ne peut être activé que s'il est prêt. */
export function canActivateStandaloneBuild(status: StandaloneBuildStatus): boolean {
  return status === READY_BUILD_STATUS;
}

/** Un build est terminal lorsqu'il ne peut plus évoluer vers un autre état métier. */
export function isTerminalStandaloneBuildStatus(status: StandaloneBuildStatus): boolean {
  return status === "failed" || status === "superseded";
}

export function isActiveStandaloneBuild(status: StandaloneBuildStatus): boolean {
  return status === ACTIVE_BUILD_STATUS;
}

/** Un domaine peut servir publiquement lorsqu'il est vérifié et que TLS est actif. */
export function isStandaloneDomainActive(input: {
  verificationStatus: StandaloneVerificationStatus;
  sslStatus: StandaloneSslStatus;
}): boolean {
  return input.verificationStatus === "verified" && input.sslStatus === "active";
}

/** Normalise un hostname HTTP : minuscules, sans port, sans point final. */
export function normalizeStandaloneHostname(raw: string): string {
  const withoutPort = raw.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  const colon = withoutPort.lastIndexOf(":");
  const withoutPortOnly =
    colon > withoutPort.indexOf("]") ? withoutPort.slice(0, colon) : withoutPort;
  return withoutPortOnly.endsWith(".") ? withoutPortOnly.slice(0, -1) : withoutPortOnly;
}

/** Validation ASCII stricte pour la V1 (IDN/punycode traités en amont). */
export function isValidStandaloneHostname(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > 253) return false;
  if (!hostname.includes(".")) return false;
  if (!/^[a-z0-9.-]+$/.test(hostname)) return false;
  if (hostname.startsWith(".") || hostname.endsWith(".") || hostname.includes("..")) return false;
  return hostname.split(".").every((label) => {
    if (label.length === 0 || label.length > 63) return false;
    if (label.startsWith("-") || label.endsWith("-")) return false;
    return true;
  });
}

/** Construit le préfixe interne d'un artefact ; les IDs sont des UUID. */
export function standaloneBuildArtifactPrefix(chatLinkId: string, buildId: string): string {
  if (!isUuid(chatLinkId) || !isUuid(buildId)) {
    throw new Error("Identifiants de build invalides");
  }
  return `standalone-builds/${chatLinkId}/${buildId}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
