import type {
  AgentLoopEvent,
  AgentLoopResult,
} from "@/application/use-cases/visual-templates/agent-poc/agent-loop";
import type { TemplateParamValues } from "@/domain/template-params";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  status?: "running" | "success" | "warning" | "error" | "cancelled";
  trace?: AgentLoopEvent[];
};

export type RevisionSnapshot = {
  id: string;
  label: string;
  createdAt: string;
  values: TemplateParamValues;
  stateHash: string;
};

export function messageId(prefix: string, sequence: number): string {
  return `${prefix}-${Date.now()}-${sequence}`;
}

export function cloneValues(values: TemplateParamValues): TemplateParamValues {
  return JSON.parse(JSON.stringify(values)) as TemplateParamValues;
}

function shortRequest(request: string): string {
  const clean = request.trim().replace(/\s+/g, " ");
  return clean.length > 80 ? `${clean.slice(0, 77)}…` : clean;
}

function friendlyReason(reason: string): string {
  if (reason.includes("INVALID_") || reason.includes("blocks[") || reason.includes("actions.")) {
    return "La modification demandée n’a pas pu être construite de façon cohérente.";
  }
  if (reason.includes("Vérification indisponible")) {
    return "Je n’ai pas pu vérifier le résultat avec assez de fiabilité.";
  }
  if (reason.includes("Observation du candidat indisponible")) {
    return "Je n’ai pas pu charger correctement l’aperçu du résultat.";
  }
  return reason;
}

export function assistantResultMessage(
  result: Exclude<AgentLoopResult, { status: "inconsistent" }>,
  request: string,
): string {
  if (result.status === "success") {
    return `C’est fait. J’ai appliqué la demande « ${shortRequest(request)} » dans l’aperçu. Tu peux vérifier le résultat, le garder ou demander une précision.`;
  }
  if (result.status === "awaiting_user_input") {
    const prefix =
      result.interaction.sourcePhase === "thought"
        ? "J’ai besoin d’une précision avant de continuer."
        : "Le résultat est appliqué, mais j’ai besoin de ta validation.";
    return `${prefix} ${result.reason}`;
  }
  if (result.status === "clarification") {
    return `J’ai besoin d’une précision : ${result.reason}`;
  }
  if (result.status === "blocked") {
    return `Je n’ai pas pu terminer la demande. ${friendlyReason(result.reason)}`;
  }
  return `Je n’ai pas pu atteindre l’objectif. ${friendlyReason(result.reason)}`;
}

export function cancelledMessage(): string {
  return "J’ai annulé cette demande. Les modifications non validées ont été retirées de l’aperçu.";
}

export function inconsistentMessage(reason: string): string {
  return `Je ne peux pas garantir que l’aperçu soit resté cohérent. ${friendlyReason(reason)} Recharge la page avant de continuer.`;
}
