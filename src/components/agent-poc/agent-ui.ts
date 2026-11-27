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

type FailureGuidance = {
  explanation: string;
  suggestion: string;
};

function failureText(result: Exclude<AgentLoopResult, { status: "inconsistent" }>): string {
  return [
    result.status === "blocked" || result.status === "failed" ? result.reason : "",
    ...(result.lastAttempt?.errors ?? []),
    ...(result.lastAttempt?.referenceErrors ?? []),
    ...(result.lastAttempt?.steps.flatMap((step) => (step.error === null ? [] : [step.error])) ??
      []),
  ]
    .filter((entry) => entry.trim() !== "")
    .join(" ");
}

function failureGuidance(
  result: Exclude<AgentLoopResult, { status: "inconsistent" }>,
): FailureGuidance {
  const text = failureText(result);
  if (/INVALID_CANDIDATE_ID|Parent candidat inconnu|candidateId|INVALID_STEP_ID/i.test(text)) {
    return {
      explanation: "Je n’ai pas réussi à relier la demande à un élément précis de l’interface.",
      suggestion:
        "Essaie de nommer exactement l’élément concerné, par exemple : « colorie le bouton Découvrir Puzzle en rouge ».",
    };
  }
  if (/INVALID_FIELD|champ inconnu|field/i.test(text)) {
    return {
      explanation: "La propriété demandée n’est pas disponible pour ce type d’élément.",
      suggestion:
        "Indique l’élément et la propriété attendue, par exemple : « change la couleur du bouton Découvrir Puzzle ».",
    };
  }
  if (/INVALID_REFERENCE_TYPE|référence|reference|action_id|style_id/i.test(text)) {
    return {
      explanation:
        "Cette modification touche une référence ou un style partagé qui ne peut pas être changé de cette manière.",
      suggestion: "Demande une copie locale du style ou précise l’élément à modifier séparément.",
    };
  }
  if (/INVALID_VALUE|valeur invalide|invalid value/i.test(text)) {
    return {
      explanation: "La valeur proposée n’est pas acceptée par le template.",
      suggestion:
        "Essaie une valeur plus simple ou précise le format attendu (couleur, texte, lien…).",
    };
  }
  if (/style|shared|partagé|color|colorer|couleur/i.test(text)) {
    return {
      explanation:
        "La modification de style n’a pas pu être appliquée sans risquer d’affecter d’autres éléments.",
      suggestion: "Précise l’élément exact et demande une modification locale de son style.",
    };
  }
  if (/Vérification indisponible/i.test(text)) {
    return {
      explanation: "Je n’ai pas pu vérifier le résultat avec assez de fiabilité.",
      suggestion: "Réessaie la demande ou recharge l’aperçu avant de continuer.",
    };
  }
  if (/Observation du candidat indisponible/i.test(text)) {
    return {
      explanation: "Je n’ai pas pu charger correctement l’aperçu du résultat.",
      suggestion: "Réessaie après avoir rechargé l’aperçu.",
    };
  }
  if (/budget|durée|timeout/i.test(text)) {
    return {
      explanation: "La demande a pris trop de temps ou nécessitait trop d’étapes.",
      suggestion: "Découpe la demande en plusieurs modifications plus simples.",
    };
  }
  return {
    explanation: "La tentative n’a pas produit un plan exécutable pour cette demande.",
    suggestion: "Reformule en indiquant l’élément, la propriété et la valeur souhaitée.",
  };
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
  const guidance = failureGuidance(result);
  return `Je n’ai pas pu appliquer cette demande. ${guidance.explanation} ${guidance.suggestion}`;
}

export function cancelledMessage(): string {
  return "J’ai annulé cette demande. Les modifications non validées ont été retirées de l’aperçu.";
}

export function inconsistentMessage(_reason: string): string {
  return "Je ne peux pas garantir que l’aperçu soit resté cohérent. Recharge la page avant de continuer.";
}
