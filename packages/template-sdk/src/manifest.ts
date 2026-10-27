/**
 * `defineManifest` — manifeste typé (ADR-0024 §5.5).
 *
 * Injecte les valeurs fixes du contrat (`schemaVersion`, `kind`,
 * `compatibility.hostProtocol`, `network`) et retourne un objet gelé.
 * `ui.integrity` n'est pas produit ici : il est calculé au build
 * (Plan-sdk-vite A003 / générateur A010).
 */
import { TEMPLATE_HOST_PROTOCOL } from "./constants.js";
import type {
  ShadowDomMode,
  TemplateCapability,
  TemplateDataContract,
  TemplateParamOption,
  TemplateParamSchema,
  TemplateTrustLevel,
  TemplateWidgetSurface,
  WidgetDisplay,
} from "./types.js";

type ParamBase = {
  key: string;
  label: string;
  description?: string;
};

/** Paramètre déclaré dans un manifeste : `default` obligatoire, `select` exige `options`. */
export type TemplateManifestParamInput =
  | (ParamBase & { type: "string" | "text"; default: string; maxLength?: number })
  | (ParamBase & { type: "number"; default: number; min?: number; max?: number })
  | (ParamBase & { type: "boolean"; default: boolean })
  | (ParamBase & { type: "color"; default: string })
  | (ParamBase & { type: "url"; default: string })
  | (ParamBase & { type: "select"; default: string; options: readonly TemplateParamOption[] });

/** Entrée de `defineManifest` (valeurs fixes non incluses). */
export type TemplateManifestInput = {
  id: string;
  name: string;
  description?: string;
  version: string;
  publisher: { id: string; name: string; trustLevel: TemplateTrustLevel };
  ui: {
    mode: "web-component" | "iframe";
    entry: string;
    element: string;
    shadowDom?: ShadowDomMode;
    /** Surface widget optionnelle (ADR-0040). */
    widget?: {
      entry: string;
      element: string;
      display?: WidgetDisplay;
    };
  };
  capabilities: readonly TemplateCapability[];
  network?: readonly string[];
  params?: readonly TemplateManifestParamInput[];
  /** Contrats de données (ADR-0026) — requis si la capacité `data` est déclarée. */
  data?: { contracts: readonly TemplateDataContract[] };
};

/** Sortie gelée de `defineManifest` (prête pour `onirtech.template.json`). */
export type TemplateManifestOutput = {
  schemaVersion: 1;
  kind: "template";
  id: string;
  name: string;
  description: string;
  version: string;
  publisher: { id: string; name: string; trustLevel: TemplateTrustLevel };
  compatibility: { hostProtocol: string };
  ui: {
    mode: "web-component" | "iframe";
    entry: string;
    element: string;
    shadowDom: ShadowDomMode;
    widget?: TemplateWidgetSurface;
  };
  capabilities: readonly TemplateCapability[];
  network: readonly string[];
  params: TemplateParamSchema[];
  data?: { contracts: TemplateDataContract[] };
};

function toParamSchema(param: TemplateManifestParamInput): TemplateParamSchema {
  const base = {
    key: param.key,
    label: param.label,
    description: param.description ?? "",
    default: param.default,
  };
  switch (param.type) {
    case "string":
    case "text":
      return {
        ...base,
        type: param.type,
        ...(param.maxLength === undefined ? {} : { maxLength: param.maxLength }),
      };
    case "number":
      return {
        ...base,
        type: param.type,
        ...(param.min === undefined ? {} : { min: param.min }),
        ...(param.max === undefined ? {} : { max: param.max }),
      };
    case "boolean":
    case "color":
    case "url":
      return { ...base, type: param.type };
    case "select":
      return { ...base, type: param.type, options: [...param.options] };
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** Construit un manifeste conforme et gelé à partir de l'entrée du développeur. */
export function defineManifest(input: TemplateManifestInput): TemplateManifestOutput {
  return deepFreeze<TemplateManifestOutput>({
    schemaVersion: 1,
    kind: "template",
    id: input.id,
    name: input.name,
    description: input.description ?? "",
    version: input.version,
    publisher: { ...input.publisher },
    compatibility: { hostProtocol: TEMPLATE_HOST_PROTOCOL },
    ui: {
      mode: input.ui.mode,
      entry: input.ui.entry,
      element: input.ui.element,
      shadowDom: input.ui.shadowDom ?? "open",
      ...(input.ui.widget === undefined
        ? {}
        : {
            widget: {
              entry: input.ui.widget.entry,
              element: input.ui.widget.element,
              integrity: "",
              display:
                input.ui.widget.display === undefined
                  ? {
                      defaultPosition: "bottom-right",
                      allowedPositions: ["bottom-right", "bottom-left"],
                      closedSize: { width: 64, height: 64 },
                      openSize: { width: 420, height: 680 },
                      maxSize: { width: 520, height: 760 },
                    }
                  : input.ui.widget.display,
            },
          }),
    },
    capabilities: [...input.capabilities],
    network: [...(input.network ?? [])],
    params: (input.params ?? []).map(toParamSchema),
    ...(input.data === undefined
      ? {}
      : {
          data: {
            contracts: input.data.contracts.map(
              (contract) => JSON.parse(JSON.stringify(contract)) as TemplateDataContract,
            ),
          },
        }),
  });
}
