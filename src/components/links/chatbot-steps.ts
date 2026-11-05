import type { ChatbotMission } from "@/domain/entities/chatbot-information";

/** Structure commune création, reprise de brouillon et modification. */
export const CHATBOT_STEPS = [
  { title: "Cadrage", short: "Cadrage" },
  { title: "Collecte", short: "Collecte" },
  { title: "Alimentation", short: "Alimentation" },
  { title: "Publication", short: "Publication" },
  { title: "IA & secours", short: "IA & secours" },
  { title: "Restrictions et quotas", short: "Restrictions" },
  { title: "Validation", short: "Validation" },
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
