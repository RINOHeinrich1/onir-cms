import { describe, expect, it, vi } from "vitest";
import type {
  StandaloneDomain,
  StandaloneRepository,
} from "@/application/ports/standalone-repository";
import type { StandaloneTlsManager } from "@/application/ports/standalone-tls";
import { issueStandaloneCertificate } from "@/application/use-cases/standalone/issue-certificate";

const domain: StandaloneDomain = {
  id: "0ca09b49-49e5-4e44-aa58-9f2a3b4a3af0",
  organizationId: "00000000-0000-0000-0000-000000000025",
  chatLinkId: "912bffda-2445-4a76-bfc6-957984edfca4",
  hostname: "client.example",
  kind: "custom_domain",
  isPrimary: false,
  verificationToken: "token-123",
  verificationStatus: "verified",
  sslStatus: "pending",
  lastCheckedAt: null,
  activatedAt: null,
  lastError: null,
  createdAt: "2026-11-23T18:00:00.000Z",
  updatedAt: "2026-11-23T18:00:00.000Z",
};

function deps(initial: StandaloneDomain = domain) {
  let current = initial;
  const setDomainSsl = vi.fn(
    async (input: {
      id: string;
      status: StandaloneDomain["sslStatus"];
      lastError?: string | null;
    }) => {
      current = { ...current, sslStatus: input.status, lastError: input.lastError ?? null };
      return current;
    },
  );
  const tls: StandaloneTlsManager = {
    issue: vi.fn(async () => ({ reference: "cert-ref", expiresAt: "2027-01-01T00:00:00.000Z" })),
  };
  return {
    tls,
    setDomainSsl,
    deps: {
      domains: { findDomain: async () => current, setDomainSsl } as unknown as Pick<
        StandaloneRepository,
        "findDomain" | "setDomainSsl"
      >,
      tls,
    },
  };
}

describe("TLS standalone", () => {
  it("émet puis active le certificat d'un domaine vérifié", async () => {
    const state = deps();
    const result = await issueStandaloneCertificate(state.deps, { domainId: domain.id });
    expect(result.sslStatus).toBe("active");
    expect(state.tls.issue).toHaveBeenCalledWith({ hostname: domain.hostname });
  });

  it("refuse un domaine non vérifié", async () => {
    const state = deps({ ...domain, verificationStatus: "pending" });
    await expect(issueStandaloneCertificate(state.deps, { domainId: domain.id })).rejects.toThrow(
      "vérifié",
    );
  });

  it("marque SSL failed si l'émission échoue", async () => {
    const state = deps();
    state.tls.issue = vi.fn(async () => {
      throw new Error("ACME timeout");
    });
    await expect(issueStandaloneCertificate(state.deps, { domainId: domain.id })).rejects.toThrow(
      "ACME timeout",
    );
    expect(state.setDomainSsl).toHaveBeenLastCalledWith({
      id: domain.id,
      status: "failed",
      lastError: "ACME timeout",
    });
  });
});
