import type { ChatbotMission } from "@/domain/entities/chatbot-information";

/** Structure commune création, reprise de brouillon et modification. */
export const CHATBOT_STEPS = [
  {
    title: "Cadrage",
    short: "Cadrage",
    sidebar: "Identité, opération, comportement",
    description: "Définir l’identité du chatbot et son opération avant de choisir ses contenus.",
  },
  {
    title: "Collecte",
    short: "Collecte",
    sidebar: "Choix de la fiche à remplir",
    description:
      "Choisir la fiche que le chatbot remplira lorsque le visiteur veut recueillir des informations.",
  },
  {
    title: "Alimentation",
    short: "Alimentation",
    sidebar: "Sources et contenus à consulter",
    description: "Choisir les sources que le chatbot consulte et les contenus qu’il peut utiliser.",
  },
  {
    title: "Publication",
    short: "Publication",
    sidebar: "Canaux et apparence",
    description: "Choisir les canaux et l’apparence une fois le contenu défini.",
  },
  {
    title: "IA & secours",
    short: "IA & secours",
    sidebar: "Modèles et repli",
    description: "Configurer les modèles IA et le comportement de secours.",
  },
  {
    title: "Restrictions et quotas",
    short: "Restrictions",
    sidebar: "Limites d’usage",
    description: "Définir les limites d’usage et l’expiration du chatbot.",
  },
  {
    title: "Validation",
    short: "Validation",
    sidebar: "Récapitulatif",
    description: "Vérifier la cohérence puis créer le chatbot.",
  },
] as const;

/** Collecte et Alimentation sont conditionnées par l'opération. */
export function isChatbotStepVisible(index: number, mission: ChatbotMission): boolean {
  if (index === 1) return mission !== "inform";
  if (index === 2) return mission !== "collect";
  return true;
}

export function visibleChatbotStepIndices(mission: ChatbotMission): number[] {
  return CHATBOT_STEPS.map((_entry, index) => index).filter((index) =>
    isChatbotStepVisible(index, mission),
  );
}

export function chatbotStepPosition(step: number, mission: ChatbotMission): number {
  return visibleChatbotStepIndices(mission).indexOf(step);
}

export function nextChatbotStep(step: number, mission: ChatbotMission): number | undefined {
  const indices = visibleChatbotStepIndices(mission);
  return indices[indices.indexOf(step) + 1];
}

export function previousChatbotStep(step: number, mission: ChatbotMission): number | undefined {
  const indices = visibleChatbotStepIndices(mission);
  return indices[indices.indexOf(step) - 1];
}
