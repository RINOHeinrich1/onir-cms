import { templateEditCandidateKey } from "@/domain/template-edit-disambiguation";
import type { TemplateEditCandidate, TemplateEditPageContext } from "@/domain/template-edit-target";

const MAX_CANDIDATES = 8;

function scopeText(candidate: TemplateEditCandidate): string {
  if (candidate.scope.kind === "page") return `page:${candidate.scope.pageId}`;
  if (candidate.scope.kind === "shared") {
    return `shared:${candidate.scope.reason}`;
  }
  return candidate.scope.kind;
}

export function buildTemplateEditRankingPrompt(input: {
  request: string;
  page: TemplateEditPageContext | null;
  candidates: TemplateEditCandidate[];
}): { system: string; user: string } {
  const candidates = input.candidates.slice(0, MAX_CANDIDATES);
  const list = candidates
    .map((candidate, index) => {
      const reasons = candidate.reasons.length === 0 ? "aucune" : candidate.reasons.join(", ");
      return [
        `${index + 1}. id=${templateEditCandidateKey(candidate)}`,
        `libellé=${candidate.label}`,
        `kind=${candidate.itemKind ?? "inconnu"}`,
        `portée=${scopeText(candidate)}`,
        `score lexical=${candidate.score}`,
        `raisons=${reasons}`,
      ].join(" | ");
    })
    .join("\n");

  const page =
    input.page === null ? "aucune page explicite" : `${input.page.label} (${input.page.pageId})`;

  return {
    system: [
      "Tu classes des cibles d’édition de template visuel.",
      "Tu ne dois jamais inventer d’identifiant : choisis uniquement parmi les ids fournis.",
      "Tu dois comprendre les synonymes et les formulations générales de l’utilisateur.",
      "Une section est un composant ; une page est la page elle-même.",
      "Si la demande est ambiguë ou si aucune cible ne correspond, retourne selectedId=null.",
      "Réponds uniquement avec un objet JSON valide, sans markdown.",
      'Format attendu : {"selectedId":"collection:itemId"|null,"confidence":"high|medium|low","ranking":[{"id":"collection:itemId","score":0.0,"reason":"..."}]}',
      "Chaque score est borné entre 0 et 1. Le classement doit contenir uniquement des ids fournis.",
    ].join("\n"),
    user: [
      `Demande utilisateur : ${input.request}`,
      `Page courante : ${page}`,
      "Candidats :",
      list,
    ].join("\n\n"),
  };
}
