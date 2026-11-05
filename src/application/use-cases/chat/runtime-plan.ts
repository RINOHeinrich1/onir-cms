import type { ChatbotConfig } from "@/domain/entities/chatbot-config";
import type {
  ChatbotInformationSources,
  ChatbotMission,
} from "@/domain/entities/chatbot-information";

export type InformationSourceKey = "fiches" | "connaissances" | "medias";

export type MissionRuntimePlan =
  | { kind: "collect" }
  | {
      kind: "inform";
      sources: InformationSourceKey[];
      analyzer: boolean;
      directSource: InformationSourceKey | null;
    }
  | { kind: "hybrid"; sources: InformationSourceKey[] };

export function enabledInformationSources(
  sources: ChatbotInformationSources,
): InformationSourceKey[] {
  const enabled: InformationSourceKey[] = [];
  if (sources.fiches.enabled && sources.fiches.ficheTypes.length > 0) enabled.push("fiches");
  if (sources.connaissances.enabled) enabled.push("connaissances");
  if (sources.medias.enabled) enabled.push("medias");
  return enabled;
}

/**
 * ADR-0068 §5.0 : le plan runtime ne contient que les capacités utiles.
 * Aucun analyseur n'est planifié lorsqu'une seule intention/source est possible.
 */
export function buildMissionRuntimePlan(config: ChatbotConfig): MissionRuntimePlan | null {
  if (config.mission === undefined || config.informationSources === undefined) return null;
  const mission: ChatbotMission = config.mission;
  const sources = enabledInformationSources(config.informationSources);
  if (mission === "collect") return { kind: "collect" };
  if (mission === "inform") {
    return {
      kind: "inform",
      sources,
      analyzer: sources.length > 1,
      directSource: sources.length === 1 ? (sources[0] ?? null) : null,
    };
  }
  return { kind: "hybrid", sources };
}
