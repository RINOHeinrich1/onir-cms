/** Sélection des sources de données d'un lien (ADR-0026 §3). */
import { NotFoundError, ValidationError } from "@/application/errors";
import type { LinkDataBindingRepository } from "@/application/ports/link-data-binding-repository";
import type { TemplateDataBindingRepository } from "@/application/ports/template-data-binding-repository";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";

export type DataBindingSelections = Record<string, string | null>;

const CONTRACT_KEY = /^[a-z][a-z0-9_]{1,40}$/;

export function parseDataBindingSelections(value: unknown): DataBindingSelections | null {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("dataBindings : objet attendu");
  }
  const out: DataBindingSelections = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!CONTRACT_KEY.test(key)) {
      throw new ValidationError(`Clé de contrat invalide : ${key}`);
    }
    if (raw === null || raw === "") {
      out[key] = null;
      continue;
    }
    if (typeof raw !== "string" || raw.trim() === "") {
      throw new ValidationError(`Source invalide pour ${key}`);
    }
    out[key] = raw.trim();
  }
  return out;
}

export type ApplyDataBindingsDeps = {
  bindings: TemplateDataBindingRepository;
  linkDataBindings: LinkDataBindingRepository;
  visualTemplates: VisualTemplateRepository;
};

/** Valide chaque source (même version/contrat) puis remplace les surcharges. */
export async function applyDataBindings(
  deps: ApplyDataBindingsDeps,
  link: {
    id: string;
    organizationId: string;
    visualTemplateId: string | null;
    visualTemplateVersion: string | null;
  },
  selections: DataBindingSelections,
): Promise<void> {
  const entries = Object.entries(selections).filter(
    (entry): entry is [string, string] => entry[1] !== null,
  );
  if (entries.length > 0) {
    if (link.visualTemplateId === null || link.visualTemplateVersion === null) {
      throw new ValidationError("Aucun template visuel sélectionné pour ces sources");
    }
    const version = await deps.visualTemplates.findVersion(
      link.visualTemplateId,
      link.visualTemplateVersion,
    );
    if (version === null) {
      throw new NotFoundError("Version de template introuvable");
    }
    for (const [contractKey, bindingId] of entries) {
      const binding = await deps.bindings.findById(link.organizationId, bindingId);
      if (
        binding === null ||
        binding.templateVersionId !== version.id ||
        binding.contractKey !== contractKey
      ) {
        throw new ValidationError(`Source de données invalide pour ${contractKey}`);
      }
    }
  }
  await deps.linkDataBindings.replace(link.id, selections);
}
