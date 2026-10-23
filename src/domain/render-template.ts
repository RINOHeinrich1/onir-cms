/**
 * Moteur de rendu des modèles (B003) — substitution `{{champ}}` + blocs
 * conditionnels `{{#if champ}}…{{/if}}`, **sans aucune évaluation de code**.
 * Les blocs ne s'imbriquent pas (documenté) ; les variables manquantes
 * valent chaîne vide ; un bloc `{{#if}}` s'affiche si la valeur est non vide
 * après trim. Pur, déterministe et testable.
 */

import type { TemplateDefinition } from "@/domain/entities/chat-template";
import { buildRenderVariables } from "@/domain/template-variables";

const IF_OPEN = "{{#if ";
const IF_CLOSE = "{{/if}}";

/** Rend `template` avec `vars` (clés = noms de champs ou variables serveur). */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  let output = "";
  let rest = template;

  while (true) {
    const openAt = rest.indexOf(IF_OPEN);
    if (openAt === -1) {
      output += substitute(rest, vars);
      break;
    }
    output += substitute(rest.slice(0, openAt), vars);
    const nameEnd = rest.indexOf("}}", openAt);
    if (nameEnd === -1) {
      output += substitute(rest.slice(openAt), vars);
      break;
    }
    const name = rest.slice(openAt + IF_OPEN.length, nameEnd).trim();
    const closeAt = rest.indexOf(IF_CLOSE, nameEnd);
    if (closeAt === -1) {
      output += substitute(rest.slice(openAt), vars);
      break;
    }
    const body = rest.slice(nameEnd + 2, closeAt);
    if ((vars[name] ?? "").trim() !== "") {
      output += substitute(body, vars);
    }
    rest = rest.slice(closeAt + IF_CLOSE.length);
  }

  return output;
}

function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_match, name: string) => {
    return vars[name] ?? "";
  });
}

/**
 * Rend le Markdown d'un livrable : variables (valeurs + serveur + `date`
 * fournie par l'appelant), puis normalisation finale (trim + saut de ligne),
 * identique à l'historique.
 */
export function renderTemplateMarkdown(input: {
  definition: TemplateDefinition;
  data: Record<string, unknown>;
  serverVars: Record<string, string>;
  date: string;
}): string {
  const vars = buildRenderVariables(input.definition, input.data, input.serverVars, {
    date: input.date,
  });
  return `${renderTemplate(input.definition.renderTemplate, vars).trim()}\n`;
}
