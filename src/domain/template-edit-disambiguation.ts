import type { TemplateEditCandidate } from "./template-edit-target";

export type TemplateEditConfidence = "high" | "medium" | "low";

export type TemplateEditRankingEntry = {
  id: string;
  score: number;
  reason?: string;
};

export type TemplateEditDecision =
  | {
      status: "selected";
      candidate: TemplateEditCandidate;
      confidence: TemplateEditConfidence;
      reason: string;
    }
  | {
      status: "ambiguous";
      question: string;
      candidates: TemplateEditCandidate[];
    }
  | { status: "not_found" };

export type DisambiguateTemplateEditInput = {
  request: string;
  candidates: TemplateEditCandidate[];
  ranking?: TemplateEditRankingEntry[];
  selectedId?: string | null;
  confidence?: TemplateEditConfidence;
};

export function templateEditCandidateKey(candidate: TemplateEditCandidate): string {
  return `${candidate.collection}:${candidate.itemId}`;
}

function pageLabel(candidate: TemplateEditCandidate): string {
  if (candidate.scope.kind === "page") return `page ${candidate.scope.pageId}`;
  if (candidate.scope.kind === "shared") return "zone partagée";
  if (candidate.scope.kind === "global") return "global";
  return "zone indéterminée";
}

function buildQuestion(request: string, candidates: TemplateEditCandidate[]): string {
  const choices = candidates
    .slice(0, 3)
    .map((candidate, index) => `${index + 1}. « ${candidate.label} » (${pageLabel(candidate)})`);
  return [
    `J’ai trouvé plusieurs cibles pour « ${request} » :`,
    ...choices,
    "Laquelle veux-tu modifier ?",
  ].join("\n");
}

function normalizedRanking(
  candidates: TemplateEditCandidate[],
  ranking: TemplateEditRankingEntry[] | undefined,
): Map<string, number> {
  const byId = new Map(
    candidates.map((candidate) => [templateEditCandidateKey(candidate), candidate]),
  );
  const scores = new Map<string, number>();
  for (const entry of ranking ?? []) {
    if (!byId.has(entry.id) || !Number.isFinite(entry.score)) continue;
    scores.set(entry.id, Math.max(0, Math.min(1, entry.score)));
  }
  return scores;
}

function candidateScore(
  candidate: TemplateEditCandidate,
  semanticScores: Map<string, number>,
): number {
  return semanticScores.get(templateEditCandidateKey(candidate)) ?? candidate.score;
}

export function disambiguateTemplateEdit(
  input: DisambiguateTemplateEditInput,
): TemplateEditDecision {
  if (input.candidates.length === 0) return { status: "not_found" };
  if (input.candidates.length === 1) {
    const candidate = input.candidates[0];
    if (candidate === undefined) return { status: "not_found" };
    return {
      status: "selected",
      candidate,
      confidence: "high",
      reason: "Cible unique.",
    };
  }

  const semanticScores = normalizedRanking(input.candidates, input.ranking);
  const sorted = [...input.candidates].sort(
    (left, right) =>
      candidateScore(right, semanticScores) - candidateScore(left, semanticScores) ||
      right.score - left.score ||
      left.label.localeCompare(right.label, "fr"),
  );
  const top = sorted[0];
  const second = sorted[1];
  if (top === undefined) return { status: "not_found" };

  const selected = input.selectedId
    ? sorted.find((candidate) => templateEditCandidateKey(candidate) === input.selectedId)
    : undefined;
  const selectedScore = selected === undefined ? 0 : candidateScore(selected, semanticScores);
  const topScore = candidateScore(top, semanticScores);
  const secondScore = second === undefined ? 0 : candidateScore(second, semanticScores);
  const confidence = input.confidence ?? "low";

  if (selected !== undefined) {
    const margin = selectedScore - secondScore;
    const threshold = confidence === "high" ? 0.05 : confidence === "medium" ? 0.15 : 1;
    if (margin >= threshold) {
      return {
        status: "selected",
        candidate: selected,
        confidence,
        reason: "Cible choisie par le classement sémantique.",
      };
    }
  }

  if (confidence === "low" && topScore >= 0.55 && topScore - secondScore >= 0.2) {
    return {
      status: "selected",
      candidate: top,
      confidence: "medium",
      reason: "Meilleur score lexical, sans classement sémantique fiable.",
    };
  }

  return {
    status: "ambiguous",
    question: buildQuestion(input.request, sorted),
    candidates: sorted.slice(0, 3),
  };
}
