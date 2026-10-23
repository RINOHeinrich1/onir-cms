/**
 * Politique d'URL des fournisseurs IA (ADR-0029 §6).
 *
 * Le serveur fait des requêtes sortantes vers une URL fournie par un admin :
 * il faut empêcher un SSRF vers le réseau interne ou les métadonnées cloud.
 * La résolution DNS n'est pas épinglée en v1 (rebinding non couvert) ; les
 * fournisseurs réellement internes passent par AI_ALLOW_PRIVATE_NETWORKS=true.
 */

const METADATA_HOSTS = new Set(["169.254.169.254", "metadata.google.internal"]);

function ipv4Parts(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  return nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? nums : null;
}

function isPrivateIpv4(host: string): boolean {
  const parts = ipv4Parts(host);
  if (parts === null) return false;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.includes(":")) {
    return (
      host === "::1" ||
      host === "::" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:") ||
      host.startsWith("::ffff:")
    );
  }
  return isPrivateIpv4(host);
}

/** Valide et normalise une URL de base OpenAI-compatible. */
export function assertAllowedAiBaseUrl(raw: string, options: { allowPrivate: boolean }): string {
  const value = raw.trim();
  if (value === "") throw new Error("URL du fournisseur manquante");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("URL du fournisseur invalide");
  }

  if (url.username !== "" || url.password !== "") {
    throw new Error("L'URL du fournisseur ne doit pas contenir d'identifiants");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("L'URL du fournisseur ne doit contenir ni query ni fragment");
  }
  if (url.protocol !== "https:" && !(options.allowPrivate && url.protocol === "http:")) {
    throw new Error("L'URL du fournisseur doit utiliser HTTPS");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (METADATA_HOSTS.has(hostname)) {
    throw new Error("Adresse de métadonnées cloud interdite");
  }
  if (!options.allowPrivate && isPrivateHostname(hostname)) {
    throw new Error("Adresse privée interdite (activez AI_ALLOW_PRIVATE_NETWORKS si nécessaire)");
  }

  return url.toString().replace(/\/$/, "");
}
