import { describe, expect, it } from "vitest";
import {
  assistantPositionRect,
  assistantRectsOverlap,
  buildAssistantCandidates,
  chooseAssistantPosition,
  clampAssistantPosition,
} from "@/components/assistant/assistant-avoidance";

const viewport = { width: 1_200, height: 800 };
const size = { width: 98, height: 108 };

describe("évitement de la fée assistante", () => {
  it("garde la fée dans la fenêtre avec une marge", () => {
    expect(clampAssistantPosition({ x: -20, y: 900 }, viewport, size)).toEqual({
      x: 18,
      y: 674,
    });
    expect(clampAssistantPosition({ x: 2_000, y: -50 }, viewport, size)).toEqual({
      x: 1_084,
      y: 18,
    });
  });

  it("produit des candidats autour de la position courante sans doublon", () => {
    const current = { x: 1_084, y: 674 };
    const candidates = buildAssistantCandidates(current, viewport, size);

    expect(candidates[0]).toEqual(current);
    expect(candidates).toContainEqual({ x: 1_084, y: 542 });
    expect(new Set(candidates.map((candidate) => `${candidate.x}:${candidate.y}`)).size).toBe(
      candidates.length,
    );
    expect(candidates.every((candidate) => candidate.x >= 18 && candidate.y >= 18)).toBe(true);
  });

  it("conserve la position si elle est libre", () => {
    const current = { x: 400, y: 300 };
    const candidates = buildAssistantCandidates(current, viewport, size);
    const chosen = chooseAssistantPosition(current, candidates, () => true);
    expect(chosen).toBe(current);
  });

  it("choisit le premier candidat libre, puis retombe sur la position courante", () => {
    const current = { x: 1_084, y: 674 };
    const candidates = buildAssistantCandidates(current, viewport, size);
    const blocked = (position: { x: number; y: number }) =>
      position.x === current.x && position.y === current.y;
    const chosen = chooseAssistantPosition(current, candidates, (position) => !blocked(position));
    expect(chosen).not.toEqual(current);
    expect(blocked(chosen)).toBe(false);

    const unresolved = chooseAssistantPosition(
      current,
      candidates,
      (position) => !blocked(position) && position.x < 0,
    );
    expect(unresolved).toBe(current);
  });

  it("détecte le recouvrement de deux rectangles", () => {
    const a = assistantPositionRect({ x: 100, y: 100 }, size);
    expect(assistantRectsOverlap(a, assistantPositionRect({ x: 150, y: 150 }, size))).toBe(true);
    expect(assistantRectsOverlap(a, assistantPositionRect({ x: 300, y: 300 }, size))).toBe(false);
  });
});
