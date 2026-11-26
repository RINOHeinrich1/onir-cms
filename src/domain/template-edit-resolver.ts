import { buildTemplateStructureIndex } from "./template-edit-structure";
import type {
  ResolveTemplateEditTargetInput,
  ResolveTemplateEditTargetResult,
  TemplateEditCandidate,
  TemplateEditHints,
  TemplateEditPageContext,
  TemplateEditTarget,
} from "./template-edit-target";
import type { TemplateEditorCollection, TemplateEditorManifest } from "./template-editor";
import { resolveDynamicRegionItem } from "./template-editor";
import type { TemplateParamValue, TemplateParamValues } from "./template-params";

type IndexedItem = {
  target: TemplateEditTarget;
  aliases: string[];
  search: string;
  kind: string;
};

type ManifestIndex = {
  pages: IndexedItem[];
  items: IndexedItem[];
};

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

const STOP_WORDS = new Set([
  "a",
  "au",
  "aux",
  "avec",
  "ce",
  "ces",
  "cet",
  "cette",
  "change",
  "changer",
  "d",
  "dans",
  "de",
  "des",
  "du",
  "elle",
  "en",
  "est",
  "et",
  "eu",
  "fait",
  "faire",
  "il",
  "ils",
  "je",
  "l",
  "la",
  "le",
  "les",
  "leur",
  "leurs",
  "lui",
  "ma",
  "mais",
  "me",
  "mes",
  "met",
  "mets",
  "modifie",
  "modifier",
  "moi",
  "mon",
  "ne",
  "nos",
  "notre",
  "nous",
  "on",
  "ou",
  "par",
  "pas",
  "pour",
  "puis",
  "que",
  "quel",
  "quelle",
  "qui",
  "sa",
  "se",
  "ses",
  "si",
  "son",
  "sont",
  "sur",
  "ta",
  "te",
  "tes",
  "toi",
  "ton",
  "tous",
  "tout",
  "toute",
  "toutes",
  "tu",
  "un",
  "une",
  "vos",
  "votre",
  "vous",
  "y",
  "ajoute",
  "ajouter",
  "enleve",
  "enlever",
  "retire",
  "retirer",
  "supprime",
  "supprimer",
]);

function isRecord(value: unknown): value is Record<string, TemplateParamValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(value: string): string[] {
  const normalized = normalize(value);
  return normalized === "" ? [] : normalized.split(" ");
}

function contentWords(value: string): string[] {
  return words(value).filter((word) => !STOP_WORDS.has(word));
}

function scalar(value: TemplateParamValue | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function collectStrings(value: TemplateParamValue | undefined, output: string[], depth = 0): void {
  if (depth > 8 || value === undefined) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    output.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, output, depth + 1);
    return;
  }
  for (const entry of Object.values(value)) collectStrings(entry, output, depth + 1);
}

function labelFor(
  collection: TemplateEditorCollection,
  item: Record<string, TemplateParamValue>,
  itemId: string,
): string {
  if (collection.itemLabel !== undefined) {
    const value = scalar(item[collection.itemLabel]);
    if (value !== "") return value;
  }
  for (const key of collection.labelFallback ?? []) {
    const value = scalar(item[key]);
    if (value !== "") return value;
  }
  return itemId;
}

function aliasesFor(
  collection: TemplateEditorCollection,
  item: Record<string, TemplateParamValue>,
  itemId: string,
  label: string,
): string[] {
  const aliases = new Set<string>([normalize(itemId), normalize(label)]);
  if (collection.itemLabel !== undefined)
    aliases.add(normalize(scalar(item[collection.itemLabel])));
  for (const key of collection.labelFallback ?? []) {
    aliases.add(normalize(scalar(item[key])));
  }
  for (const key of ["slug", "title", "name"]) {
    aliases.add(normalize(scalar(item[key])));
  }
  return [...aliases].filter((alias) => alias !== "");
}

function buildIndex(editor: TemplateEditorManifest, values: TemplateParamValues): ManifestIndex {
  const collections = editor.version === 2 ? (editor.collections ?? []) : [];
  const pageCollection = editor.version === 2 ? (editor.structure?.roots ?? null) : null;
  const structure = buildTemplateStructureIndex(editor, values);
  const structuralCollections = new Set(
    [
      editor.version === 2 ? editor.structure?.children?.through : undefined,
      editor.version === 2 ? editor.structure?.regions?.collection : undefined,
    ].filter((param): param is string => param !== undefined),
  );
  const items: IndexedItem[] = [];

  for (const collection of collections) {
    if (structuralCollections.has(collection.param)) continue;
    const raw = values[collection.param];
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      if (!isRecord(entry)) continue;
      const itemId = scalar(entry[collection.itemKey]);
      if (itemId === "") continue;
      const label = labelFor(collection, entry, itemId);
      const itemKind = collection.itemKind === undefined ? "" : scalar(entry[collection.itemKind]);
      const kind = normalize(itemKind);
      const structureItem = structure.get(collection.param, itemId);
      const scope = structureItem?.scope ?? { kind: "unknown" as const };
      const pageId = scope.kind === "page" ? scope.pageId : undefined;
      const target: TemplateEditTarget = {
        kind: collection.param === pageCollection ? "page" : "collectionItem",
        collection: collection.param,
        itemKey: collection.itemKey,
        itemId,
        label,
        ...(itemKind === "" ? {} : { itemKind }),
        ...(pageId === undefined ? {} : { pageId }),
        scope,
      };
      const strings: string[] = [label, itemId, itemKind];
      collectStrings(entry, strings);
      items.push({
        target,
        aliases: aliasesFor(collection, entry, itemId, label),
        search: normalize(strings.join(" ")),
        kind,
      });
    }
  }

  return {
    pages: items.filter((item) => item.target.kind === "page"),
    items,
  };
}

function hasPhrase(haystack: string, needle: string): boolean {
  if (needle === "") return false;
  return (
    haystack === needle ||
    haystack.startsWith(`${needle} `) ||
    haystack.endsWith(` ${needle}`) ||
    haystack.includes(` ${needle} `)
  );
}

function findPageMention(request: string, pages: IndexedItem[]): IndexedItem | null {
  const normalizedRequest = normalize(request);
  let best: { item: IndexedItem; score: number } | null = null;
  for (const page of pages) {
    for (const alias of page.aliases) {
      if (alias.length < 2 || !hasPhrase(normalizedRequest, alias)) continue;
      const score = alias.split(" ").length * 10 + alias.length;
      if (best === null || score > best.score) best = { item: page, score };
    }
  }
  return best?.item ?? null;
}

function resolvePageContext(
  request: string,
  pages: IndexedItem[],
  currentPageId: string | null | undefined,
): TemplateEditPageContext | null {
  const requestWords = words(request);
  const namesPage = requestWords.includes("page") || requestWords.includes("pages");
  const explicit = namesPage ? findPageMention(request, pages) : null;
  if (explicit !== null) {
    return {
      pageId: explicit.target.itemId,
      label: explicit.target.label,
      source: "explicit",
    };
  }
  if (currentPageId !== null && currentPageId !== undefined) {
    const current = pages.find((page) => page.target.itemId === currentPageId);
    if (current !== undefined) {
      return {
        pageId: current.target.itemId,
        label: current.target.label,
        source: "current",
      };
    }
  }
  return null;
}

function detectHints(request: string): TemplateEditHints {
  const tokens = words(request);
  const has = (values: string[]): boolean => values.some((value) => tokens.includes(value));
  const hasPageWord = has(["page", "pages"]);
  const pageAsScope =
    /\b(?:dans|sur|pour|de|du|des|a|au|aux)\s+(?:la\s+|le\s+|les\s+|l\s+)?pages?\b/.test(
      normalize(request),
    );
  const wantsButton = has(["bouton", "boutons", "cta"]);
  const wantsCard = has(["carte", "cartes"]);
  const wantsSection = has(["section", "sections", "bloc", "blocs", "composant", "composants"]);
  return {
    wantsPage: hasPageWord && !pageAsScope && !wantsButton && !wantsCard,
    wantsButton,
    wantsCard,
    wantsImage: has(["image", "images", "photo", "photos"]),
    wantsSection,
    wantsStyle: has(["fond", "couleur", "couleurs", "style", "background"]),
  };
}

function matchesKindHints(item: IndexedItem, hints: TemplateEditHints): boolean {
  if (hints.wantsButton) return item.kind === "button";
  if (hints.wantsCard) return item.kind === "card";
  if (hints.wantsImage) return item.kind === "image";
  return true;
}

function scoreItem(
  item: IndexedItem,
  request: string,
  terms: string[],
  page: TemplateEditPageContext | null,
  hints: TemplateEditHints,
): { score: number; reasons: string[] } {
  const normalizedRequest = normalize(request);
  const reasons: string[] = [];
  let score = 0;

  const label = normalize(item.target.label);
  if (label !== "" && hasPhrase(normalizedRequest, label)) {
    score += 0.45;
    reasons.push(`libellé « ${item.target.label} »`);
  }

  let hits = 0;
  for (const term of terms) {
    if (item.search.includes(term)) hits += 1;
  }
  if (terms.length > 0 && hits > 0) {
    score += 0.35 * (hits / terms.length);
    reasons.push(`${hits}/${terms.length} terme(s) trouvé(s)`);
  }

  const kindHint =
    (hints.wantsButton && item.kind === "button") ||
    (hints.wantsCard && item.kind === "card") ||
    (hints.wantsImage && item.kind === "image");
  if (kindHint) {
    score += 0.15;
    reasons.push(`kind=${item.target.itemKind ?? item.kind}`);
  }

  if (
    page !== null &&
    item.target.scope.kind === "page" &&
    item.target.scope.pageId === page.pageId
  ) {
    score += 0.1;
    reasons.push(`page=${page.label}`);
  }

  if (item.target.itemId !== "" && hasPhrase(normalizedRequest, normalize(item.target.itemId))) {
    score += 0.05;
    reasons.push(`id=${item.target.itemId}`);
  }

  return { score: Math.min(1, Number(score.toFixed(2))), reasons };
}

function findSelectedItem(
  editor: TemplateEditorManifest,
  values: TemplateParamValues,
  regionId: string,
  index: ManifestIndex,
): IndexedItem | null {
  const selected = resolveDynamicRegionItem(editor, regionId, values);
  if (selected === null) return null;
  const itemId = scalar(selected.item[selected.keyField]);
  return (
    index.items.find(
      (item) =>
        item.target.collection === selected.collection &&
        item.target.itemId === (itemId === "" ? selected.itemId : itemId),
    ) ?? null
  );
}

function toCandidate(item: IndexedItem, score: number, reasons: string[]): TemplateEditCandidate {
  return { ...item.target, score, reasons };
}

function selectableItems(
  index: ManifestIndex,
  hints: TemplateEditHints,
  page: TemplateEditPageContext | null,
): IndexedItem[] {
  if (hints.wantsPage) return index.pages;
  return index.items.filter((item) => {
    if (item.target.kind !== "collectionItem") return false;
    if (!matchesKindHints(item, hints)) return false;
    return !(
      page !== null &&
      item.target.scope.kind === "page" &&
      item.target.scope.pageId !== page.pageId
    );
  });
}

function sortCandidates(candidates: TemplateEditCandidate[]): TemplateEditCandidate[] {
  return candidates.sort(
    (left, right) => right.score - left.score || left.label.localeCompare(right.label, "fr"),
  );
}

function candidateLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

export function listTemplateEditCandidates(
  input: ResolveTemplateEditTargetInput,
): TemplateEditCandidate[] {
  const index = buildIndex(input.editor, input.values);
  const hints = detectHints(input.request);
  const page = resolvePageContext(input.request, index.pages, input.currentPageId);

  if (input.selection !== null && input.selection !== undefined) {
    const selected = findSelectedItem(input.editor, input.values, input.selection.regionId, index);
    if (selected !== null) return [toCandidate(selected, 1, ["sélection"])];
  }

  const terms = contentWords(input.request);
  const candidates = selectableItems(index, hints, page).map((item) => {
    const scored = scoreItem(item, input.request, terms, page, hints);
    return toCandidate(item, scored.score, scored.reasons);
  });
  return sortCandidates(candidates).slice(0, candidateLimit(input.limit));
}

export function resolveTemplateEditTarget(
  input: ResolveTemplateEditTargetInput,
): ResolveTemplateEditTargetResult {
  const index = buildIndex(input.editor, input.values);
  const hints = detectHints(input.request);
  const page = resolvePageContext(input.request, index.pages, input.currentPageId);

  if (input.selection !== null && input.selection !== undefined) {
    const selected = findSelectedItem(input.editor, input.values, input.selection.regionId, index);
    if (selected !== null) {
      return {
        page,
        hints,
        candidates: [toCandidate(selected, 1, ["sélection"])],
      };
    }
  }

  const terms = contentWords(input.request);
  const candidates: TemplateEditCandidate[] = [];
  const seen = new Set<string>();
  const hasSignal = (reasons: string[]): boolean =>
    reasons.some(
      (reason) =>
        reason.startsWith("libellé") ||
        reason.includes("terme(s)") ||
        reason.startsWith("kind=") ||
        reason.startsWith("id="),
    );

  for (const item of selectableItems(index, hints, page)) {
    const scored = scoreItem(item, input.request, terms, page, hints);
    if (scored.score < 0.1 || !hasSignal(scored.reasons)) continue;
    const key = `${item.target.collection}:${item.target.itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(toCandidate(item, scored.score, scored.reasons));
  }

  return {
    page,
    hints,
    candidates: sortCandidates(candidates).slice(0, candidateLimit(input.limit)),
  };
}
