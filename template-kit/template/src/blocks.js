// Rendu générique des blocs de message (ADR-0067 §5). Module PUR : aucune
// dépendance au DOM, aucun HTML brut. Le composant `index.js` transforme ces
// descriptions en nœuds DOM via `textContent` (jamais `innerHTML`).

/** Versions du contrat de bloc comprises par ce template. */
export const KNOWN_CONTRACT_VERSIONS = [1];

export function isKnownContractVersion(version) {
  return KNOWN_CONTRACT_VERSIONS.includes(version);
}

const FIELD_TYPES = new Set([
  "text",
  "textarea",
  "number",
  "date",
  "url",
  "email",
  "image",
  "select",
  "multi",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
  return String(value);
}

/** Date lisible et déterministe (AAAA-MM-JJ → JJ/MM/AAAA). */
export function formatDate(value) {
  const raw = asText(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match === null) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Valeur seule d'un champ typé (sans libellé), toujours en texte. */
export function formatToolFieldValue(field) {
  if (!isRecord(field)) return "";
  const type = FIELD_TYPES.has(field.type) ? field.type : "text";
  const value = field.value;
  let text;
  switch (type) {
    case "date":
      text = formatDate(value);
      break;
    case "number": {
      const numeric = typeof value === "number" ? value : Number(value);
      text = Number.isFinite(numeric) ? String(numeric) : asText(value);
      if (text !== "" && typeof field.unit === "string" && field.unit !== "") {
        text = `${text} ${field.unit}`;
      }
      break;
    }
    case "multi":
      text = Array.isArray(value) ? value.map((entry) => String(entry)).join(" · ") : asText(value);
      break;
    default:
      text = asText(value);
  }
  return text;
}

/**
 * Représentation texte complète d'un champ typé. Un type inconnu retombe sur
 * le texte de sa valeur (jamais d'échec, jamais de HTML).
 */
export function formatToolField(field) {
  if (!isRecord(field)) return "";
  const label = typeof field.label === "string" && field.label !== "" ? field.label : "";
  const text = formatToolFieldValue(field);
  return label === "" ? text : `${label} : ${text}`;
}

function normalizeField(field) {
  if (!isRecord(field)) return null;
  const key = typeof field.key === "string" ? field.key : "";
  if (key === "") return null;
  // Un champ fichier n'est jamais rendu (ADR-0067 §6/§10).
  if (field.type === "file") return null;
  const type = typeof field.type === "string" ? field.type : "text";
  const raw = field.value;
  const value =
    raw === null || typeof raw === "string" || typeof raw === "number"
      ? raw
      : Array.isArray(raw)
        ? raw.filter((entry) => typeof entry === "string")
        : null;
  return {
    key,
    label: typeof field.label === "string" && field.label !== "" ? field.label : key,
    type,
    value,
    ...(typeof field.unit === "string" && field.unit !== "" ? { unit: field.unit } : {}),
  };
}

/**
 * Valide un bloc. Retourne une description sûre, ou `null` si le bloc est
 * inconnu / d'une version non comprise : l'appelant affiche alors `content`.
 */
export function resolveBlock(block) {
  if (!isRecord(block)) return null;
  if (block.type === "text" && typeof block.text === "string") {
    return { type: "text", text: block.text };
  }
  if (block.type === "image" && typeof block.url === "string") {
    return {
      type: "image",
      url: block.url,
      ...(typeof block.alt === "string" ? { alt: block.alt } : {}),
    };
  }
  if (block.type === "tool_search_result") {
    if (!isKnownContractVersion(block.contractVersion)) return null;
    if (typeof block.tool !== "string" || !Array.isArray(block.items)) return null;
    const items = [];
    for (const item of block.items) {
      if (!isRecord(item) || !Array.isArray(item.fields)) continue;
      const fields = item.fields.map(normalizeField).filter((field) => field !== null);
      if (fields.length > 0) items.push({ fields });
    }
    const meta = isRecord(block.meta) ? block.meta : {};
    return {
      type: "tool_search_result",
      tool: block.tool,
      layout: block.layout === "card" || block.layout === "list" ? block.layout : "list",
      items,
      meta: {
        ...(typeof meta.total === "number" ? { total: meta.total } : {}),
        ...(typeof meta.hasMore === "boolean" ? { hasMore: meta.hasMore } : {}),
      },
    };
  }
  return null;
}

/** Texte de secours si le template ne sait rien rendre d'autre. */
export function renderFallbackText(blocks, content) {
  const body = typeof content === "string" ? content : "";
  const rawBlocks = Array.isArray(blocks) ? blocks : [];
  const lines = [];
  for (const block of rawBlocks) {
    const resolved = resolveBlock(block);
    if (resolved === null) continue;
    if (resolved.type === "text") {
      if (resolved.text.trim() !== "") lines.push(resolved.text);
      continue;
    }
    if (resolved.type === "tool_search_result") {
      for (const item of resolved.items) {
        const values = item.fields
          .filter((field) => field.type !== "image")
          .map((field) => formatToolField(field))
          .filter((value) => value !== "");
        if (values.length > 0) lines.push(values.join(" — "));
      }
    }
  }
  if (lines.length > 0) return lines.join("\n");
  return body;
}
