import type { LoadedTemplateSkill } from "@/application/ports/template-skill-loader";
import {
  formatTemplateEditHistory,
  type TemplateEditHistoryMessage,
} from "./template-edit-history";

function catalogEntry(skill: LoadedTemplateSkill): Record<string, unknown> {
  return {
    id: skill.skill.id,
    title: skill.skill.title,
    description: skill.skill.description,
    intents: skill.skill.intents.map((intent) => intent.description),
    examples: skill.skill.examples.map((example) => example.request),
    priority: skill.skill.priority,
    always: skill.skill.always,
  };
}

export function buildTemplateSkillRoutingPrompt(input: {
  request: string;
  skills: LoadedTemplateSkill[];
  history?: TemplateEditHistoryMessage[];
}): { system: string; user: string } {
  return {
    system: [
      "Tu es le routeur de compétences d’un template visuel ONIR-CMS.",
      "Tu choisis uniquement parmi les skills fournis.",
      "Tu ne dois jamais inventer d’identifiant.",
      "Tu ne dois pas exécuter d’action et tu ne produis pas d’opération d’édition.",
      "Tu ne sélectionnes pas un skill sur un simple mot-clé : tu comprends l’intention, le contexte et les formulations.",
      "Si la demande est ambiguë, retourne une clarification et ne sélectionne rien.",
      "Si aucun skill ne correspond, retourne une liste vide.",
      "Maximum 3 skills sélectionnés.",
      'Réponds uniquement avec un JSON valide, sans markdown : {"skills":[{"id":"...","confidence":0.0,"reason":"..."}],"clarification":null|"..."}',
    ].join("\n"),
    user: [
      `Demande : ${input.request}`,
      `Conversation précédente :
${formatTemplateEditHistory(input.history ?? [])}`,
      `Skills disponibles : ${JSON.stringify(input.skills.map(catalogEntry))}`,
    ].join("\n\n"),
  };
}
