/** Consigne de concision ajoutée automatiquement au prompt de réponse. */
export function replyLengthGuardrail(maxTokens: number): string {
  const words = Math.max(40, Math.floor(maxTokens * 0.6));
  return [
    "Contrainte de concision :",
    `ta réponse complète doit tenir en environ ${words} mots maximum (budget ${maxTokens} tokens).`,
    "Termine toujours tes phrases.",
    "Si le sujet nécessite plus de détails, donne une synthèse claire et propose de poursuivre.",
  ].join(" ");
}

/** Marque une réponse qui a encore été coupée après le retry compact. */
export function interruptedAnswerMarker(): string {
  return "\n\n_(Réponse interrompue : limite de longueur atteinte.)_";
}
