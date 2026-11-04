import { describe, expect, it } from "vitest";
import { parseInvitationProvisioning } from "@/application/use-cases/invitations/invitation-provisioning";

describe("snapshot de provisioning d'invitation", () => {
  it("définit la première ressource comme défaut pour tous les usages", () => {
    const parsed = parseInvitationProvisioning({
      maxChatbots: 1,
      allocations: [{ target: { kind: "cluster", clusterId: "cluster-1" }, maxTokens: 100 }],
    });
    expect(parsed?.defaults).toHaveLength(5);
    expect(parsed?.defaults.every((entry) => entry.target.kind === "cluster")).toBe(true);
  });

  it("conserve des défauts explicites", () => {
    const parsed = parseInvitationProvisioning({
      allocations: [
        { target: { kind: "cluster", clusterId: "cluster-1" }, maxTokens: 100 },
        {
          target: { kind: "model", providerId: "provider-1", model: "model-1" },
          maxTokens: 50,
        },
      ],
      defaults: [
        {
          usage: "response",
          target: { kind: "model", providerId: "provider-1", model: "model-1" },
        },
      ],
    });
    expect(parsed?.defaults).toEqual([
      {
        usage: "response",
        target: { kind: "model", providerId: "provider-1", model: "model-1" },
      },
    ]);
  });
});
