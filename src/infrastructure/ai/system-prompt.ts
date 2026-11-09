/**
 * Prompt système piloté par le modèle (B006) — remplace le prompt figé
 * `buildSystemPrompt()` + `FICHE_GUIDE`. Rend `definition.systemPrompt`
 * via le moteur, avec les variables serveur (contexte prospect/visiteur).
 */

import type { TemplateDefinition } from "@/domain/entities/chat-template";
import { renderTemplate } from "@/domain/render-template";
import { sanitizeSystemPrompt } from "@/domain/template-settings";
import { buildRenderVariables } from "@/domain/template-variables";

export function buildSystemPromptFromTemplate(input: {
  definition: TemplateDefinition;
  serverVars: Record<string, string>;
}): string {
  return renderTemplate(
    sanitizeSystemPrompt(input.definition.systemPrompt),
    buildRenderVariables(input.definition, {}, input.serverVars),
  );
}
