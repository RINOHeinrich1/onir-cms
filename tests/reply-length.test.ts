import { describe, expect, it } from "vitest";
import { replyLengthGuardrail } from "@/application/use-cases/chat/reply-length";

describe("garde-fou de longueur des réponses", () => {
  it("convertit le budget en consigne de concision", () => {
    const guardrail = replyLengthGuardrail(400);
    expect(guardrail).toContain("240 mots maximum");
    expect(guardrail).toContain("budget 400 tokens");
    expect(guardrail).toContain("Termine toujours tes phrases");
  });

  it("impose un plancher lisible pour les petits budgets", () => {
    expect(replyLengthGuardrail(100)).toContain("60 mots maximum");
  });
});
