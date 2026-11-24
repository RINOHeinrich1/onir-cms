import { ValidationError } from "@/application/errors";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import {
  normalizeTemplateParamValuesStrict,
  type TemplateParamValues,
  validateTemplateParamValues,
} from "@/domain/template-params";

/**
 * Prépare les variables d'un lien avant persistance (ADR-0023).
 *
 * - aucune valeur ⇒ rien à valider ;
 * - aucun template rattaché ⇒ les valeurs sont ignorées (pas de schéma) ;
 * - template/version introuvable ⇒ refus explicite ;
 * - valeurs invalides ⇒ `400` détaillé (validation **stricte** à l'écriture).
 *
 * Les clés inconnues du schéma sont conservées telles quelles (valeurs « plus
 * utilisées »), jamais rejetées.
 */
export async function prepareLinkParams(
  visualTemplates: VisualTemplateRepository,
  visualTemplateId: string | null,
  visualTemplateVersion: string | null,
  raw: unknown,
): Promise<TemplateParamValues> {
  if (visualTemplateId === null || visualTemplateVersion === null) return {};

  const normalized = normalizeTemplateParamValuesStrict(raw);
  if (!normalized.ok) {
    throw new ValidationError(
      `Paramètres invalides : ${normalized.errors
        .map((error) => `${error.field} — ${error.message}`)
        .join(" ; ")}`,
    );
  }
  const values = normalized.value;
  if (Object.keys(values).length === 0) return values;

  const version = await visualTemplates.findVersion(visualTemplateId, visualTemplateVersion);
  if (version === null) {
    throw new ValidationError("Template visuel introuvable (version épinglée)");
  }
  const errors = validateTemplateParamValues(version.manifest.params, values);
  if (errors.length > 0) {
    throw new ValidationError(
      `Paramètres invalides : ${errors.map((error) => `${error.field} — ${error.message}`).join(" ; ")}`,
    );
  }
  return values;
}
