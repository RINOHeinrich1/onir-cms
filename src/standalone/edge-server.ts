import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { StandaloneBuildStorage } from "@/application/ports/standalone-build-storage";
import type {
  ActiveStandaloneMapping,
  StandaloneRepository,
} from "@/application/ports/standalone-repository";
import { isValidStandaloneHostname, normalizeStandaloneHostname } from "@/domain/standalone";

export type StandaloneEdgeDependencies = {
  mappings: Pick<StandaloneRepository, "findActiveMappingByHostname">;
  storage: StandaloneBuildStorage;
  /** Origine interne de l'API ONIR-CMS pour le proxy same-origin. */
  apiOrigin: string;
  mappingTtlMs?: number;
  fileTtlMs?: number;
  maxCacheBytes?: number;
  now?: () => number;
  logger?: (message: string, detail?: Record<string, unknown>) => void;
};

type CachedFile = { data: Uint8Array; contentType: string };
type CachedFileEntry = { file: CachedFile; expiresAt: number; size: number };

type CacheEntry = { value: ActiveStandaloneMapping | null; expiresAt: number };

export function normalizeEdgeRequestPath(rawUrl: string): string | null {
  const rawPath = rawUrl.split(/[?#]/)[0] ?? "";
  let rawDecoded: string;
  try {
    rawDecoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (
    rawDecoded.includes("\0") ||
    rawDecoded.includes("\\") ||
    rawDecoded.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }

  let pathname: string;
  try {
    pathname = new URL(rawPath, "http://edge.local").pathname;
  } catch {
    return null;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const trailingSlash = decoded.endsWith("/");
  const segments = decoded.split("/").filter((segment) => segment !== "");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  const relative = segments.join("/");
  if (relative === "") return "index.html";
  return trailingSlash ? `${relative}/index.html` : relative;
}

function hostFromRequest(request: IncomingMessage): string | null {
  const raw = request.headers.host;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const hostname = normalizeStandaloneHostname(raw);
  return isValidStandaloneHostname(hostname) ? hostname : null;
}

function cacheControlFor(path: string): string {
  if (path.endsWith(".html") || path === "index.html") {
    return "public, max-age=60, must-revalidate";
  }
  return "public, max-age=31536000, immutable";
}

function send(
  response: ServerResponse,
  status: number,
  body: string | Uint8Array,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
}

async function proxyChatApi(
  request: IncomingMessage,
  response: ServerResponse,
  apiOrigin: string,
  hostname: string,
): Promise<void> {
  const rawUrl = request.url ?? "/";
  if (!rawUrl.startsWith("/api/") || rawUrl.startsWith("//")) {
    throw new Error("Chemin API invalide");
  }
  const baseOrigin = new URL(apiOrigin);
  const requested = new URL(rawUrl, baseOrigin);
  if (requested.origin !== baseOrigin.origin) {
    throw new Error("Origine API non autorisée");
  }
  const target = new URL(baseOrigin.origin);
  target.pathname = requested.pathname;
  target.search = requested.search;
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || name === "host" || name === "connection") continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }
  headers.set("x-forwarded-host", hostname);
  headers.set(
    "x-forwarded-proto",
    typeof request.headers["x-forwarded-proto"] === "string"
      ? request.headers["x-forwarded-proto"]
      : "https",
  );

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const init = {
    method: request.method ?? "GET",
    headers,
    redirect: "manual" as const,
    ...(hasBody
      ? {
          body: Readable.toWeb(request) as ReadableStream<Uint8Array>,
          duplex: "half" as const,
        }
      : {}),
  } satisfies RequestInit & { duplex?: "half" };

  const upstream = await fetch(target, init);
  response.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
  if (upstream.body === null) {
    response.end();
    return;
  }
  Readable.fromWeb(upstream.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>)
    .on("error", () => response.destroy())
    .pipe(response);
}

/**
 * Crée le serveur edge multi-tenant.
 * Le serveur ne construit rien et ne lit pas les secrets : il sert un build actif.
 */
export function createStandaloneEdgeServer(deps: StandaloneEdgeDependencies): Server {
  const mappingCache = new Map<string, CacheEntry>();
  const fileCache = new Map<string, CachedFileEntry>();
  const ttl = deps.mappingTtlMs ?? 60_000;
  const fileTtl = deps.fileTtlMs ?? 300_000;
  const maxCacheBytes = deps.maxCacheBytes ?? 64 * 1024 * 1024;
  let cachedBytes = 0;
  const now = deps.now ?? Date.now;

  async function mappingFor(hostname: string): Promise<ActiveStandaloneMapping | null> {
    const cached = mappingCache.get(hostname);
    if (cached !== undefined && cached.expiresAt > now()) return cached.value;
    const value = await deps.mappings.findActiveMappingByHostname(hostname);
    mappingCache.set(hostname, { value, expiresAt: now() + ttl });
    return value;
  }

  function readFileCache(key: string): CachedFile | null {
    const cached = fileCache.get(key);
    if (cached === undefined) return null;
    if (cached.expiresAt <= now()) {
      fileCache.delete(key);
      cachedBytes -= cached.size;
      return null;
    }
    return cached.file;
  }

  function writeFileCache(key: string, file: CachedFile): void {
    const size = file.data.byteLength;
    if (size > maxCacheBytes) return;
    const previous = fileCache.get(key);
    if (previous !== undefined) {
      cachedBytes -= previous.size;
      fileCache.delete(key);
    }
    while (cachedBytes + size > maxCacheBytes && fileCache.size > 0) {
      const oldest = fileCache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const removed = fileCache.get(oldest);
      if (removed !== undefined) cachedBytes -= removed.size;
      fileCache.delete(oldest);
    }
    fileCache.set(key, { file, expiresAt: now() + fileTtl, size });
    cachedBytes += size;
  }

  return createServer(async (request, response) => {
    try {
      if (request.url === "/health" || request.url === "/health/") {
        send(response, 200, JSON.stringify({ ok: true }), {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        return;
      }

      const hostname = hostFromRequest(request);
      if (hostname === null) {
        send(response, 400, "Invalid host", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }

      const mapping = await mappingFor(hostname);
      if (mapping === null) {
        send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }

      const path = normalizeEdgeRequestPath(request.url ?? "/");
      if (path === null) {
        send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }

      // API de chat : proxy same-origin vers ONIR-CMS. Pas de CORS nécessaire.
      if (path === "api" || path.startsWith("api/")) {
        await proxyChatApi(request, response, deps.apiOrigin, hostname);
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        send(response, 405, "Method Not Allowed", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }

      const cacheKey = `${mapping.buildId}:${path}`;
      const cachedFile = readFileCache(cacheKey);
      const file = cachedFile ?? (await deps.storage.get(`${mapping.artifactKey}/${path}`));
      if (file === null) {
        deps.logger?.("standalone_edge_missing", {
          hostname,
          buildId: mapping.buildId,
          path,
        });
        send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }
      if (cachedFile === null) writeFileCache(cacheKey, file);

      response.setHeader("Content-Type", file.contentType);
      response.setHeader("Content-Length", String(file.data.byteLength));
      response.setHeader("Cache-Control", cacheControlFor(path));
      response.setHeader("X-Content-Type-Options", "nosniff");
      if (request.method === "HEAD") {
        response.end();
      } else {
        response.end(file.data);
      }
    } catch (error) {
      deps.logger?.("standalone_edge_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!response.headersSent) {
        send(response, 502, "Bad gateway", { "Content-Type": "text/plain; charset=utf-8" });
      } else {
        response.end();
      }
    }
  });
}
