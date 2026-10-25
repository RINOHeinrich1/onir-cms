/**
 * Variables du moteur de rendu (B004) — documentées, calculées côté serveur.
 * - `buildServerVariables` : contexte de la conversation (prospect/visiteur).
 * - `buildRenderVariables` : valeurs + dérivés (`multi` → puces, `select` →
 *   booléens `<nom>_<valeur>`, `champs_guide` enrichi pour les prompts).
 */

import type { Conversation } from "@/domain/entities/chat";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { Prospect } from "@/domain/entities/prospect";
import { prospectContext } from "@/domain/prospect-rules";

export type ServerVariableContext = {
  mode: "specifique" | "standard";
  prospect: Prospect | null;
  conversation: Conversation | null;
};

/**
 * Variables serveur documentées : `date`, `visitor_nom`, `visitor_email`,
 * `visitor_identifie`, `prospect_nom`, `prospect_prenom`, `prospect_nature`,
 * `prospect_nature_label`, `prospect_email`, `prospect_activite`,
 * `prospect_fonction`, `prospect_contexte`, `prospect_connu`, `visiteur_connu`,
 * `prospect_present` (rendu : un prospect est rattaché).
 */
export function buildServerVariables(context: ServerVariableContext): Record<string, string> {
  const { mode, prospect, conversation } = context;
  const hasProspect = mode === "specifique" && prospect !== null;
  return {
    date: new Date().toISOString().slice(0, 10),
    visitor_nom: conversation?.visitorNom ?? "",
    visitor_email: conversation?.visitorEmail ?? "",
    visitor_identifie: mode === "standard" ? "1" : "",
    prospect_nom: prospect?.nom ?? "",
    prospect_prenom: prospect?.prenom ?? "",
    prospect_nature: prospect?.nature ?? "",
    prospect_nature_label:
      prospect?.nature === "physique"
        ? "personne physique"
        : prospect?.nature === "morale"
          ? "personne morale"
          : "",
    prospect_email: prospect?.email ?? "",
    prospect_activite: prospect?.activite ?? "",
    prospect_fonction: prospect?.fonction ?? "",
    prospect_contexte: prospect ? prospectContext(prospect) : "",
    prospect_connu: hasProspect ? "1" : "",
    visiteur_connu: hasProspect ? "" : "1",
    prospect_present: prospect ? "1" : "",
  };
}

/**
 * Variables de rendu : valeurs brutes + dérivés.
 * `extra` porte les variables libres (`date` de la fiche, `prospect_*`…).
 */
export function buildRenderVariables(
  definition: TemplateDefinition,
  data: Record<string, unknown>,
  serverVars: Record<string, string>,
  extra: Record<string, string> = {},
  /** Noms de pièces jointes par champ fichier (ADR-0034). */
  fileValues: Record<string, string[]> = {},
): Record<string, string> {
  const vars: Record<string, string> = { ...serverVars, ...extra };

  for (const field of definition.fields) {
    if (field.type === "file") {
      const names = fileValues[field.name] ?? [];
      vars[field.name] = names.map((name) => `- ${name}`).join("\n");
      continue;
    }
    const value = data[field.name];
    if (field.type === "multi") {
      const items = Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
        : [];
      vars[field.name] = items.map((item) => `- ${item}`).join("\n");
      continue;
    }
    const text = typeof value === "string" ? value : "";
    vars[field.name] = text;
    if (field.type === "select" && text !== "") {
      vars[`${field.name}_${text}`] = "1";
    }
  }

  const labels = definition.fields.map((field) => {
    const required = field.required
      ? " (obligatoire)"
      : field.requiredIf !== undefined
        ? ` (obligatoire si ${field.requiredIf.field} vaut « ${field.requiredIf.equals} »)`
        : "";
    const options =
      field.options !== undefined && field.options.length > 0
        ? ` — valeurs possibles : ${field.options.join(", ")}`
        : "";
    const example =
      field.example !== undefined && field.example.trim() !== ""
        ? ` — exemple : ${field.example.trim()}`
        : "";
    const fileHint = field.type === "file" ? " — pièce jointe à demander" : "";
    return `- ${field.label}${required}${options}${example}${fileHint}`;
  });
  vars.champs_guide = labels.join("\n");

  return vars;
}
