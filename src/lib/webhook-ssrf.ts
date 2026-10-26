/**
 * Garde SSRF des webhooks (ADR-0035).
 * Les adresses privées, loopback, link-local, multicast, de documentation et
 * de métadonnées cloud sont refusées par défaut. La résolution DNS est faite
 * avant la connexion, puis l'adresse validée est imposée au client HTTP.
 */
import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
import { ValidationError } from "@/application/errors";

export type ResolvedWebhookAddress = { address: string; family: 4 | 6 };

export type ResolvedWebhookTarget = {
  url: URL;
  addresses: ResolvedWebhookAddress[];
};

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google",
]);

const ALWAYS_BLOCKED_ADDRESSES = new Set(["169.254.169.254", "100.100.100.200", "fd00:ec2::254"]);

function ipv4Private(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a = 0, b = 0] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a === 192 && b === 88 && parts[2] === 99) return true;
  if (a >= 224) return true;
  return false;
}

function ipv6Private(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  if (normalized === "::" || normalized === "::1") return true;

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped?.[1] !== undefined) return ipv4Private(mapped[1]);
  const mappedHex = /^::(?:ffff:)?(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (mappedHex?.[1] !== undefined && mappedHex[2] !== undefined) {
    const hi = Number.parseInt(mappedHex[1], 16);
    const lo = Number.parseInt(mappedHex[2], 16);
    return ipv4Private(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
  }

  if (normalized.startsWith("::")) return true;

  const first = Number.parseInt(normalized.split(":")[0] ?? "", 16);
  if (!Number.isFinite(first)) return true;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (first === 0x2001 && /^2001:(0?db8|0000)/.test(normalized)) return true;
  if (first === 0x2002) return true; // 6to4
  if (first === 0x64 && normalized.startsWith("64:ff9b:")) return true; // NAT64
  if (first === 0xfec0) return true; // site-local déprécié
  return false;
}

/** Vrai si l'adresse ne doit pas être contactée par défaut. */
export function isPrivateWebhookAddress(address: string): boolean {
  const bare = address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;
  if (isIPv4(bare)) return ipv4Private(bare);
  if (isIPv6(bare)) return ipv6Private(bare);
  return true;
}

function hostnameBlocked(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "[::]"
  );
}

/**
 * Résout et valide une URL de webhook. Les adresses retournées sont celles
 * qui doivent être utilisées pour la connexion (anti-rebinding).
 */
export async function resolveWebhookTarget(
  rawUrl: string,
  allowPrivateNetwork: boolean,
  allowInsecureHttp = false,
): Promise<ResolvedWebhookTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ValidationError("URL de webhook invalide");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("Le webhook doit utiliser http(s)");
  }
  if (url.protocol === "http:" && !allowInsecureHttp) {
    throw new ValidationError("HTTP non chiffré non autorisé pour ce webhook");
  }
  if (url.username !== "" || url.password !== "") {
    throw new ValidationError("L'URL du webhook ne doit pas contenir d'identifiants");
  }
  const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  if (hostname === "" || hostnameBlocked(hostname)) {
    throw new ValidationError("Hôte de webhook interdit");
  }

  let addresses: ResolvedWebhookAddress[];
  if (isIPv4(hostname)) {
    addresses = [{ address: hostname, family: 4 }];
  } else if (isIPv6(hostname)) {
    addresses = [{ address: hostname, family: 6 }];
  } else {
    try {
      const resolved = await lookup(hostname, { all: true, verbatim: true });
      addresses = resolved
        .filter((entry) => entry.family === 4 || entry.family === 6)
        .map((entry) => ({ address: entry.address, family: entry.family as 4 | 6 }));
    } catch {
      throw new ValidationError("Hôte de webhook introuvable");
    }
  }
  if (addresses.length === 0) throw new ValidationError("Hôte de webhook introuvable");
  if (addresses.some((entry) => ALWAYS_BLOCKED_ADDRESSES.has(entry.address))) {
    throw new ValidationError("Le webhook cible une adresse de métadonnées interdite");
  }
  if (!allowPrivateNetwork && addresses.some((entry) => isPrivateWebhookAddress(entry.address))) {
    throw new ValidationError("Le webhook cible une adresse réseau interdite");
  }
  return { url, addresses };
}
