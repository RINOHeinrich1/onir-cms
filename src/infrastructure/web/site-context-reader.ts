/**
 * Crawler borné pour l'assistance IA (ADR-0038) : même origine, 1..10 pages,
 * profondeur 0..2, robots.txt, timeout, taille maximale et protection SSRF.
 * Aucun JavaScript n'est exécuté : les sites uniquement rendus côté client
 * produisent un avertissement.
 */

import { lookup } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import { load } from "cheerio";
import robotsParser from "robots-parser";
import { Agent, fetch as undiciFetch } from "undici";
import type {
  CrawledPage,
  WebsiteContext,
  WebsiteContextReader,
  WebsiteCrawlOptions,
} from "@/application/ports/website-context-reader";
import { assertPublicHttpUrl, isPrivateIp } from "@/infrastructure/web/safe-url";

const USER_AGENT = "OnirCmsBot/1.0 (+https://onirtech.com)";
const MAX_BYTES_PER_PAGE = 1024 * 1024;
const MAX_TOTAL_CHARS = 40_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_ROBOTS_BYTES = 128 * 1024;

const ASSET_PATTERN =
  /\.(?:jpg|jpeg|png|gif|webp|svg|ico|css|js|map|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|zip|gz|pdf|docx?|xlsx?|pptx?|odt|ods|odp)$/i;

type FetchResult = {
  response: Awaited<ReturnType<typeof undiciFetch>>;
  finalUrl: string;
};

function safeLookup(): LookupFunction {
  return (hostname, options, callback) => {
    lookup(hostname, { all: true, verbatim: true })
      .then((addresses) => {
        const first = addresses[0];
        if (first === undefined) {
          callback(new Error("Nom de domaine introuvable"), "", 0);
          return;
        }
        if (addresses.some((entry) => isPrivateIp(entry.address))) {
          callback(new Error("Adresse réseau privée refusée"), "", 0);
          return;
        }
        if (typeof options === "object" && options.all === true) {
          callback(null, addresses);
          return;
        }
        callback(null, first.address, first.family);
      })
      .catch((error: unknown) => {
        callback(error instanceof Error ? error : new Error("Résolution DNS impossible"), "", 0);
      });
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replaceAll("\u0000", "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sameOrigin(a: URL, b: URL): boolean {
  return a.origin === b.origin;
}

async function requestWithRedirects(raw: string, dispatcher: Agent): Promise<FetchResult> {
  let current = await assertPublicHttpUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await undiciFetch(current.toString(), {
      dispatcher,
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location === null) throw new Error("Redirection sans destination");
      const next = new URL(location, current);
      current = await assertPublicHttpUrl(next.toString());
      continue;
    }
    return { response, finalUrl: current.toString() };
  }
  throw new Error("Trop de redirections");
}

async function readBodyLimited(
  response: Awaited<ReturnType<typeof undiciFetch>>,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { text: "", truncated: true };
  }
  if (response.body === null) return { text: "", truncated: false };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  let truncated = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > maxBytes) {
        truncated = true;
        await reader.cancel();
        break;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return { text: text + decoder.decode(), truncated };
}

async function loadRobots(
  start: URL,
  dispatcher: Agent,
): Promise<{
  parser: ReturnType<typeof robotsParser>;
  warning: string | null;
}> {
  const robotsUrl = new URL("/robots.txt", start);
  try {
    const { response } = await requestWithRedirects(robotsUrl.toString(), dispatcher);
    if (response.status === 404) {
      return { parser: robotsParser(robotsUrl.toString(), ""), warning: null };
    }
    if (!response.ok) {
      return {
        parser: robotsParser(robotsUrl.toString(), ""),
        warning: `robots.txt inaccessible (HTTP ${response.status}) : crawl poursuivi avec prudence.`,
      };
    }
    const { text } = await readBodyLimited(response, MAX_ROBOTS_BYTES);
    return { parser: robotsParser(robotsUrl.toString(), text), warning: null };
  } catch {
    return {
      parser: robotsParser(robotsUrl.toString(), ""),
      warning: "robots.txt illisible : crawl poursuivi avec prudence.",
    };
  }
}

function extractPage(html: string, url: string): { page: CrawledPage; links: string[] } {
  const $ = load(html);
  $("script, style, noscript, template, svg, canvas").remove();
  const title = normalizeText($("title").first().text()) || url;
  const text = normalizeText($("body").text());
  const links = new Set<string>();
  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (href === undefined || href.trim() === "") return;
    const normalized = normalizeUrl(href, url);
    if (normalized !== null) links.add(normalized);
  });
  return { page: { url, title, text }, links: [...links] };
}

export function siteContextReader(): WebsiteContextReader {
  return {
    async read(rawUrl: string, options: WebsiteCrawlOptions): Promise<WebsiteContext> {
      const start = await assertPublicHttpUrl(rawUrl);
      const maxPages = clamp(options.maxPages, 1, 10);
      const maxDepth = clamp(options.maxDepth, 0, 2);
      const warnings: string[] = [];
      const pages: CrawledPage[] = [];
      const visited = new Set<string>();
      const dispatcher = new Agent({ connect: { lookup: safeLookup() } });

      try {
        const robots = await loadRobots(start, dispatcher);
        if (robots.warning !== null) warnings.push(robots.warning);
        if (robots.parser.isAllowed(start.toString(), USER_AGENT) === false) {
          return {
            startUrl: start.toString(),
            pages: [],
            chars: 0,
            truncated: false,
            warnings: [...warnings, "Le site interdit le crawl de cette page via robots.txt."],
          };
        }

        const queue: Array<{ url: string; depth: number }> = [{ url: start.toString(), depth: 0 }];
        let totalChars = 0;
        let truncated = false;

        while (queue.length > 0 && pages.length < maxPages) {
          const next = queue.shift();
          if (next === undefined || visited.has(next.url)) continue;
          visited.add(next.url);
          if (robots.parser.isAllowed(next.url, USER_AGENT) === false) continue;

          let result: FetchResult;
          try {
            result = await requestWithRedirects(next.url, dispatcher);
          } catch (error) {
            warnings.push(
              `${next.url} : ${error instanceof Error ? error.message : "lecture impossible"}`,
            );
            continue;
          }
          const { response, finalUrl } = result;
          if (!response.ok) {
            warnings.push(`${finalUrl} : HTTP ${response.status}`);
            continue;
          }
          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
            warnings.push(`${finalUrl} : contenu non HTML ignoré.`);
            continue;
          }
          const body = await readBodyLimited(response, MAX_BYTES_PER_PAGE);
          if (body.truncated) warnings.push(`${finalUrl} : page tronquée (1 Mo maximum).`);
          if (body.text.trim() === "") {
            warnings.push(`${finalUrl} : page vide ou rendue uniquement en JavaScript.`);
            continue;
          }
          const extracted = extractPage(body.text, finalUrl);
          const remaining = MAX_TOTAL_CHARS - totalChars;
          if (remaining <= 0) {
            truncated = true;
            break;
          }
          const pageText =
            extracted.page.text.length > remaining
              ? extracted.page.text.slice(0, remaining)
              : extracted.page.text;
          if (pageText.length < extracted.page.text.length) truncated = true;
          pages.push({ ...extracted.page, text: pageText });
          totalChars += pageText.length;

          if (next.depth < maxDepth) {
            const origin = new URL(finalUrl);
            for (const link of extracted.links) {
              const parsed = normalizeUrl(link);
              if (parsed === null) continue;
              const candidate = new URL(parsed);
              if (!sameOrigin(origin, candidate)) continue;
              if (ASSET_PATTERN.test(candidate.pathname)) continue;
              if (!visited.has(parsed)) queue.push({ url: parsed, depth: next.depth + 1 });
            }
          }
        }

        if (totalChars >= MAX_TOTAL_CHARS) truncated = true;
        if (truncated)
          warnings.push("Le contenu du site a été tronqué pour rester dans les limites.");
        return { startUrl: start.toString(), pages, chars: totalChars, truncated, warnings };
      } finally {
        await dispatcher.close();
      }
    },
  };
}
