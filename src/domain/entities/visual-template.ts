/**
 * Templates visuels — domaine (ADR-0019, norme `onirtech.template-host.v1`).
 * Un template visuel est un **package UI-only** (manifeste + assets) qui rend
 * l'interface publique du chat et du formulaire. Le domaine valide le manifeste ;
 * il ne connaît ni l'archive, ni la base, ni le stockage.
 */
import { type TemplateDataContract, validateTemplateDataBlock } from "@/domain/data-contracts";
import { type TemplateParamSchema, validateTemplateParamSchema } from "@/domain/template-params";

export const TEMPLATE_HOST_PROTOCOL = "onirtech.template-host.v1";
export const TEMPLATE_SCHEMA_VERSION = 1;
export const TEMPLATE_KIND = "template";

export const TEMPLATE_TRUST_LEVELS = ["official", "verified", "community"] as const;
export type TemplateTrustLevel = (typeof TEMPLATE_TRUST_LEVELS)[number];

export const TEMPLATE_MODES = ["web-component", "iframe"] as const;
export type TemplateMode = (typeof TEMPLATE_MODES)[number];

export const TEMPLATE_CAPABILITIES = [
  "messages",
  "media",
  "modelForm",
  "theme",
  // Capacités cœur additives (ADR-0020) : le manifeste peut les déclarer, l'hôte
  // ne fournit la donnée que si elles sont déclarées ET que le lien l'autorise.
  "userState",
  "knowledge",
  // Pièces jointes de prospection (ADR-0034) : champs fichier du modèle.
  "attachments",
  // Contrats de données déclarés (ADR-0026) : ressources structurées servies
  // par un fournisseur (SQL en v1), validées contre le schéma du template.
  "data",
] as const;
export type TemplateCapability = (typeof TEMPLATE_CAPABILITIES)[number];

export const TEMPLATE_SHADOW_DOMS = ["open", "closed", "none"] as const;
export type TemplateShadowDom = (typeof TEMPLATE_SHADOW_DOMS)[number];

export type TemplateManifest = {
  schemaVersion: number;
  kind: typeof TEMPLATE_KIND;
  id: string;
  name: string;
  description: string;
  version: string;
  publisher: { id: string; name: string; trustLevel: TemplateTrustLevel };
  compatibility: { hostProtocol: string };
  ui: {
    mode: TemplateMode;
    entry: string;
    element: string;
    integrity: string;
    shadowDom: TemplateShadowDom;
  };
  capabilities: TemplateCapability[];
  network: string[];
  /** Variables paramétrables déclarées (ADR-0023) ; [] si aucune. */
  params: TemplateParamSchema[];
  /** Contrats de données déclarés (ADR-0026) ; [] si aucun. */
  dataContracts: TemplateDataContract[];
};

export type ManifestValidationError = { field: string; message: string };

const KEBAB = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/;
const INTEGRITY = /^sha256-[A-Za-z0-9+/]+={0,2}$/;
const ELEMENT = /^[a-z][a-z0-9-]*$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Chemin relatif sûr : ni absolu, ni `..`, ni antislash, ni segment vide. */
export function isSafeRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\")) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** Normalise `./index.js` → `index.js`. */
export function normalizeArchivePath(path: string): string {
  return path.replace(/^\.\//, "");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Valide un manifeste de template visuel (norme v1). */
export function validateTemplateManifest(
  input: unknown,
): { ok: true; value: TemplateManifest } | { ok: false; errors: ManifestValidationError[] } {
  const src =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const errors: ManifestValidationError[] = [];
  const add = (field: string, message: string): void => {
    errors.push({ field, message });
  };

  if (src.schemaVersion !== TEMPLATE_SCHEMA_VERSION) {
    add("schemaVersion", `schemaVersion doit valoir ${TEMPLATE_SCHEMA_VERSION}`);
  }
  if (src.kind !== TEMPLATE_KIND) {
    add("kind", `kind doit valoir "${TEMPLATE_KIND}"`);
  }

  const id = text(src.id);
  if (!KEBAB.test(id)) {
    add("id", "id doit être en kebab-case (^[a-z][a-z0-9-]*$)");
  }
  const version = text(src.version);
  if (!SEMVER.test(version)) {
    add("version", "version doit être en SemVer (ex. 1.0.0)");
  }

  const publisher =
    src.publisher !== null && typeof src.publisher === "object" && !Array.isArray(src.publisher)
      ? (src.publisher as Record<string, unknown>)
      : {};
  const trustLevel = text(publisher.trustLevel);
  if (!(TEMPLATE_TRUST_LEVELS as readonly string[]).includes(trustLevel)) {
    add("publisher.trustLevel", `trustLevel ∈ ${TEMPLATE_TRUST_LEVELS.join(", ")}`);
  }

  const compatibility =
    src.compatibility !== null &&
    typeof src.compatibility === "object" &&
    !Array.isArray(src.compatibility)
      ? (src.compatibility as Record<string, unknown>)
      : {};
  if (text(compatibility.hostProtocol) !== TEMPLATE_HOST_PROTOCOL) {
    add("compatibility.hostProtocol", `hostProtocol attendu : ${TEMPLATE_HOST_PROTOCOL}`);
  }

  const ui =
    src.ui !== null && typeof src.ui === "object" && !Array.isArray(src.ui)
      ? (src.ui as Record<string, unknown>)
      : {};
  const mode = text(ui.mode);
  if (!(TEMPLATE_MODES as readonly string[]).includes(mode)) {
    add("ui.mode", `mode ∈ ${TEMPLATE_MODES.join(", ")}`);
  }
  // Trust gating : un template `community` NE PEUT PAS monter un Web Component
  // privilégié dans la page → il doit passer par l'iframe sandboxée.
  if (mode === "web-component" && trustLevel === "community") {
    add("ui.mode", "un template community doit utiliser le mode iframe");
  }
  const entry = normalizeArchivePath(text(ui.entry));
  if (!isSafeRelativePath(entry)) {
    add("ui.entry", "entry doit être un chemin relatif sûr (pas d'absolu ni de ..)");
  }
  const element = text(ui.element);
  if (!ELEMENT.test(element)) {
    add("ui.element", "element doit être en kebab-case (custom element)");
  }
  const integrity = text(ui.integrity);
  if (!INTEGRITY.test(integrity)) {
    add("ui.integrity", "integrity doit être au format SRI sha256-<base64>");
  }
  const shadowDomRaw = text(ui.shadowDom);
  const shadowDom = shadowDomRaw === "" ? "open" : shadowDomRaw;
  if (!(TEMPLATE_SHADOW_DOMS as readonly string[]).includes(shadowDom)) {
    add("ui.shadowDom", `shadowDom ∈ ${TEMPLATE_SHADOW_DOMS.join(", ")}`);
  }

  const capabilities = isStringArray(src.capabilities) ? src.capabilities : [];
  for (const capability of capabilities) {
    if (!(TEMPLATE_CAPABILITIES as readonly string[]).includes(capability)) {
      add("capabilities", `capacité inconnue : ${capability}`);
    }
    if (capability === "data" && mode !== "web-component") {
      add("capabilities", "la capacité data exige le mode web-component");
    }
  }

  const network = src.network === undefined ? [] : src.network;
  if (!isStringArray(network)) {
    add("network", "network doit être une liste de domaines (vide par défaut)");
  }

  const params = validateTemplateParamSchema(src.params);
  if (!params.ok) {
    for (const error of params.errors) add(error.field, error.message);
  }

  // ADR-0026 : la capacité `data` exige un bloc `data.contracts` non vide, et
  // réciproquement un bloc `data` sans capacité est un manifeste incohérent.
  let dataContracts: TemplateDataContract[] = [];
  const hasData = capabilities.includes("data");
  if (hasData) {
    if (src.data === undefined) {
      add("data", "bloc data requis quand la capacité data est déclarée");
    } else {
      const data = validateTemplateDataBlock(src.data);
      if (!data.ok) errors.push(...data.errors);
      else dataContracts = data.value;
    }
  } else if (src.data !== undefined) {
    add("data", "bloc data déclaré sans la capacité data");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      schemaVersion: TEMPLATE_SCHEMA_VERSION,
      kind: TEMPLATE_KIND,
      id,
      name: text(src.name) === "" ? id : text(src.name),
      description: text(src.description),
      version,
      publisher: {
        id: text(publisher.id),
        name: text(publisher.name),
        trustLevel: trustLevel as TemplateTrustLevel,
      },
      compatibility: { hostProtocol: TEMPLATE_HOST_PROTOCOL },
      ui: {
        mode: mode as TemplateMode,
        entry,
        element,
        integrity,
        shadowDom: shadowDom as TemplateShadowDom,
      },
      capabilities: capabilities as TemplateCapability[],
      network: network as string[],
      params: params.ok ? params.value : [],
      dataContracts,
    },
  };
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
  ".map": "application/json",
};

/** Type MIME déduit de l'extension (défaut : binaire). */
export function mimeByExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  return MIME_BY_EXTENSION[path.slice(dot).toLowerCase()] ?? "application/octet-stream";
}
