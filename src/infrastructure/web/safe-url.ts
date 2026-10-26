/**
 * Garde SSRF pour le crawler de l'assistance IA (ADR-0038).
 * Toute URL doit être HTTP(S), sans identifiants, et résoudre uniquement vers
 * des adresses publiques.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

function ipv4Private(parts: readonly number[]): boolean {
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** Vrai si l'adresse IP ne doit jamais être contactée par le crawler. */
export function isPrivateIp(value: string): boolean {
  const version = isIP(value);
  if (version === 4) {
    return ipv4Private(value.split(".").map((part) => Number(part)));
  }
  if (version === 6) {
    const normalized = value.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith("::ffff:")) {
      return isPrivateIp(normalized.slice("::ffff:".length));
    }
    return false;
  }
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/\.$/, "");
  return (
    BLOCKED_HOSTNAMES.has(value) ||
    value.endsWith(".localhost") ||
    value.endsWith(".local") ||
    value.endsWith(".internal")
  );
}

/**
 * Valide une URL et lève une erreur si elle peut viser un réseau interne.
 * La résolution DNS est refaite à chaque requête/redirection.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL invalide");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Seules les URL HTTP et HTTPS sont autorisées");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("Les URL avec identifiants intégrés sont refusées");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "" || isBlockedHostname(hostname)) {
    throw new Error("Cette adresse réseau est refusée");
  }

  if (isIP(hostname) !== 0) {
    if (isPrivateIp(hostname)) throw new Error("Les adresses IP privées sont refusées");
    return url;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error("Nom de domaine introuvable");
  if (addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("Le domaine résout vers une adresse réseau privée");
  }
  return url;
}
