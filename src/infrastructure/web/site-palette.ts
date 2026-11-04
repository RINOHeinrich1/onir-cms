import { load } from "cheerio";
import {
  EMPTY_SITE_PALETTE,
  type SiteColorCandidate,
  type SitePalette,
  type SitePaletteContext,
} from "@/domain/site-palette";

type PalettePage = { url: string; html: string };
type Accumulated = { weight: number; contexts: Set<SitePaletteContext>; pages: Set<string> };

const COLOR_RE = /#[0-9a-fA-F]{8}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3,4}|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
const RULE_RE = /([^{}]+)\{([^{}]*)\}/g;
const VAR_RE = /var\(\s*(--[a-z0-9_-]+)\s*\)/gi;
const SELECTOR_ACTION = /button|btn|cta|action|submit/i;
const SELECTOR_SURFACE = /card|panel|surface|modal|dialog/i;
const SELECTOR_TEXT = /body|html|main|p\b|h[1-6]|text|content/i;
const SELECTOR_BACKGROUND = /body|html|main|header|footer|section|page|background/i;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeHex(value: string): string | null {
  const raw = value.trim().toLowerCase();
  if (!raw.startsWith("#")) return null;
  const hex = raw.slice(1);
  if (hex.length === 3)
    return `#${hex
      .split("")
      .map((part) => part + part)
      .join("")}`;
  if (hex.length === 6) return `#${hex}`;
  if (hex.length === 8) {
    const alpha = Number.parseInt(hex.slice(6), 16) / 255;
    return alpha < 0.5 ? null : `#${hex.slice(0, 6)}`;
  }
  return null;
}

function parseRgbChannel(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    const percent = Number(trimmed.slice(0, -1));
    return Number.isFinite(percent) ? clamp(Math.round((percent / 100) * 255), 0, 255) : null;
  }
  const number = Number(trimmed);
  return Number.isFinite(number) ? clamp(Math.round(number), 0, 255) : null;
}

function normalizeColor(value: string): string | null {
  const raw = value.trim();
  const hex = normalizeHex(raw);
  if (hex !== null) return hex;
  const rgb = /^rgba?\(([^)]*)\)$/i.exec(raw);
  if (rgb !== null) {
    const parts = rgb[1]?.split(",").map((part) => part.trim()) ?? [];
    if (parts.length < 3) return null;
    if (parts.length >= 4) {
      const alpha = Number(parts[3]);
      if (Number.isFinite(alpha) && alpha < 0.5) return null;
    }
    const channels = [
      parseRgbChannel(parts[0] ?? ""),
      parseRgbChannel(parts[1] ?? ""),
      parseRgbChannel(parts[2] ?? ""),
    ];
    if (channels.some((channel) => channel === null)) return null;
    return `#${channels.map((channel) => (channel as number).toString(16).padStart(2, "0")).join("")}`;
  }
  const hsl = /^hsla?\(([^)]*)\)$/i.exec(raw);
  if (hsl !== null) {
    const parts = hsl[1]?.split(",").map((part) => part.trim()) ?? [];
    if (parts.length < 3) return null;
    if (parts.length >= 4) {
      const alpha = Number(parts[3]);
      if (Number.isFinite(alpha) && alpha < 0.5) return null;
    }
    const h = Number(parts[0]?.replace("deg", ""));
    const s = Number(parts[1]?.replace("%", ""));
    const l = Number(parts[2]?.replace("%", ""));
    if (![h, s, l].every((part) => Number.isFinite(part))) return null;
    const saturation = clamp(s / 100, 0, 1);
    const lightness = clamp(l / 100, 0, 1);
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const hue = (((h % 360) + 360) % 360) / 60;
    const x = chroma * (1 - Math.abs((hue % 2) - 1));
    const m = lightness - chroma / 2;
    const [r, g, b] =
      hue < 1
        ? [chroma, x, 0]
        : hue < 2
          ? [x, chroma, 0]
          : hue < 3
            ? [0, chroma, x]
            : hue < 4
              ? [0, x, chroma]
              : hue < 5
                ? [x, 0, chroma]
                : [chroma, 0, x];
    return `#${[r + m, g + m, b + m]
      .map((channel) =>
        Math.round(channel * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  }
  return null;
}

function colorsIn(value: string, variables: Map<string, string>): string[] {
  let resolved = value;
  for (let depth = 0; depth < 2; depth += 1) {
    resolved = resolved.replace(
      VAR_RE,
      (match, name: string) => variables.get(name.toLowerCase()) ?? match,
    );
  }
  return (resolved.match(COLOR_RE) ?? [])
    .map(normalizeColor)
    .filter((color): color is string => color !== null);
}

function selectorContext(selector: string): SitePaletteContext {
  if (SELECTOR_ACTION.test(selector)) return "actions";
  if (SELECTOR_SURFACE.test(selector)) return "surfaces";
  if (SELECTOR_BACKGROUND.test(selector)) return "background";
  if (SELECTOR_TEXT.test(selector)) return "text";
  return "other";
}

function propertyWeight(property: string): number {
  if (property === "background-color" || property === "background") return 1;
  if (property === "color") return 0.8;
  if (property === "border-color" || property === "border") return 0.2;
  if (property.startsWith("--")) return 0.4;
  return 0;
}

function selectorWeight(context: SitePaletteContext): number {
  if (context === "background" || context === "actions") return 1;
  if (context === "text" || context === "surfaces") return 0.8;
  return 0.5;
}

function addColor(
  map: Map<string, Accumulated>,
  color: string,
  weight: number,
  context: SitePaletteContext,
  page: string,
): void {
  const current = map.get(color) ?? { weight: 0, contexts: new Set(), pages: new Set() };
  current.weight += weight;
  current.contexts.add(context);
  current.pages.add(page);
  map.set(color, current);
}

function parseDeclarations(
  map: Map<string, Accumulated>,
  declarations: string,
  selector: string,
  page: string,
  variables: Map<string, string>,
): void {
  const context = selectorContext(selector);
  for (const declaration of declarations.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (property.startsWith("--")) {
      const normalized = colorsIn(value, variables)[0];
      if (normalized !== undefined) variables.set(property, normalized);
    }
    const weight = propertyWeight(property);
    if (weight === 0) continue;
    for (const color of colorsIn(value, variables)) {
      addColor(map, color, weight * selectorWeight(context), context, page);
    }
  }
}

function mergeCloseColors(map: Map<string, Accumulated>): Array<[string, Accumulated]> {
  const entries = [...map.entries()].sort((a, b) => b[1].weight - a[1].weight);
  const merged: Array<[string, Accumulated]> = [];
  for (const [hex, data] of entries) {
    const target = merged.find(([existing]) => {
      const a = existing
        .slice(1)
        .match(/.{2}/g)
        ?.map((part) => Number.parseInt(part, 16));
      const b = hex
        .slice(1)
        .match(/.{2}/g)
        ?.map((part) => Number.parseInt(part, 16));
      if (a === undefined || b === undefined || a.length < 3 || b.length < 3) return false;
      const [ar, ag, ab] = a;
      const [br, bg, bb] = b;
      if (
        ar === undefined ||
        ag === undefined ||
        ab === undefined ||
        br === undefined ||
        bg === undefined ||
        bb === undefined
      )
        return false;
      return Math.hypot(ar - br, ag - bg, ab - bb) <= 24;
    });
    if (target === undefined) {
      merged.push([
        hex,
        { weight: data.weight, contexts: new Set(data.contexts), pages: new Set(data.pages) },
      ]);
    } else {
      target[1].weight += data.weight;
      for (const context of data.contexts) target[1].contexts.add(context);
      for (const page of data.pages) target[1].pages.add(page);
    }
  }
  return merged;
}

/** Extrait une palette heuristique à partir des HTML crawlés et CSS accessibles. */
export function extractSitePalette(
  pages: readonly PalettePage[],
  cssTexts: readonly string[],
): SitePalette {
  if (pages.length === 0) return EMPTY_SITE_PALETTE;
  const map = new Map<string, Accumulated>();
  const variables = new Map<string, string>();
  const styles: Array<{ selector: string; declarations: string; page: string }> = [];

  for (const page of pages) {
    const $ = load(page.html);
    $('meta[name="theme-color"]').each((_i, element) => {
      for (const color of colorsIn($(element).attr("content") ?? "", variables)) {
        addColor(map, color, 0.8, "background", page.url);
      }
    });
    $("style").each((_i, element) => {
      styles.push({ selector: "", declarations: $(element).text(), page: page.url });
    });
    $("[style]").each((_i, element) => {
      const inline = $(element).attr("style") ?? "";
      parseDeclarations(map, inline, "inline", page.url, variables);
    });
  }

  for (const css of cssTexts) {
    styles.push({ selector: "", declarations: css, page: pages[0]?.url ?? "css" });
  }

  for (const style of styles) {
    if (style.declarations.trim() === "") continue;
    if (style.selector === "inline") {
      parseDeclarations(map, style.declarations, "inline", style.page, variables);
      continue;
    }
    RULE_RE.lastIndex = 0;
    let match = RULE_RE.exec(style.declarations);
    while (match !== null) {
      const selector = (match[1] ?? "").trim();
      const declarations = match[2] ?? "";
      if (!selector.startsWith("@")) {
        parseDeclarations(map, declarations, selector, style.page, variables);
      }
      match = RULE_RE.exec(style.declarations);
    }
  }

  const merged = mergeCloseColors(map);
  const total = merged.reduce((sum, [, data]) => sum + data.weight, 0);
  if (total <= 0) return EMPTY_SITE_PALETTE;
  const candidates: SiteColorCandidate[] = merged.slice(0, 10).map(([hex, data]) => ({
    hex,
    usageRate: Number((data.weight / total).toFixed(3)),
    contexts: [...data.contexts],
  }));
  const confidence =
    candidates.length >= 3 && total >= 3
      ? "high"
      : candidates.length >= 2 && total >= 1
        ? "medium"
        : "low";
  return { candidates, confidence };
}
