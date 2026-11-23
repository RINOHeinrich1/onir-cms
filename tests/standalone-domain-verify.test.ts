import { describe, expect, it, vi } from "vitest";
import type { StandaloneDnsResolver } from "@/application/ports/standalone-dns";
import type {
  StandaloneDomain,
  StandaloneRepository,
} from "@/application/ports/standalone-repository";
import {
  standaloneVerificationRecord,
  standaloneVerificationValue,
  verifyStandaloneDomain,
} from "@/application/use-cases/standalone/verify-domain";

const domain: StandaloneDomain = {
  id: "0ca09b49-49e5-4e44-aa58-9f2a3b4a3af0",
  organizationId: "00000000-0000-0000-0000-000000000025",
  chatLinkId: "912bffda-2445-4a76-bfc6-957984edfca4",
  hostname: "client.example",
  kind: "custom_domain",
  isPrimary: false,
  verificationToken: "token-123",
  verificationStatus: "pending",
  sslStatus: "pending",
  lastCheckedAt: null,
  activatedAt: null,
  lastError: null,
  createdAt: "2026-11-23T18:00:00.000Z",
  updatedAt: "2026-11-23T18:00:00.000Z",
};

function repo(initial: StandaloneDomain = domain) {
  const states: StandaloneDomain[] = [initial];
  const setDomainVerification = vi.fn(
    async (input: {
      id: string;
      status: StandaloneDomain["verificationStatus"];
      lastError?: string | null;
    }) => {
      const next = {
        ...(states.at(-1) ?? initial),
        verificationStatus: input.status,
        lastError: input.lastError ?? null,
      };
      states.push(next);
      return next;
    },
  );
  return {
    states,
    setDomainVerification,
    repo: {
      findDomain: vi.fn(async () => states.at(-1) ?? null),
      setDomainVerification,
    } as unknown as Pick<StandaloneRepository, "findDomain" | "setDomainVerification">,
  };
}

function dns(txt: string[][], cname: string[] = ["edge.standalone.test"]): StandaloneDnsResolver {
  return {
    resolveTxt: vi.fn(async () => txt),
    resolveCname: vi.fn(async () => cname),
  };
}

describe("vérification de domaine standalone", () => {
  it("produit les informations DNS attendues", () => {
    expect(standaloneVerificationRecord("WWW.Client.example.")).toBe(
      "_onir-verify.www.client.example",
    );
    expect(standaloneVerificationValue("token-123")).toBe("onir-verification=token-123");
  });

  it("vérifie TXT et CNAME", async () => {
    const state = repo();
    const result = await verifyStandaloneDomain(
      {
        domains: state.repo,
        dns: dns([[standaloneVerificationValue("token-123")]]),
        edgeHostname: "edge.standalone.test",
      },
      { domainId: domain.id },
    );
    expect(result.verificationStatus).toBe("verified");
    expect(state.setDomainVerification).toHaveBeenLastCalledWith({
      id: domain.id,
      status: "verified",
      lastError: null,
    });
  });

  it("échoue sans TXT valide", async () => {
    const state = repo();
    await expect(
      verifyStandaloneDomain(
        { domains: state.repo, dns: dns([["onir-verification=autre"]]) },
        { domainId: domain.id },
      ),
    ).rejects.toThrow("TXT");
    expect(state.states.at(-1)?.verificationStatus).toBe("failed");
  });

  it("échoue avec un CNAME différent", async () => {
    const state = repo();
    await expect(
      verifyStandaloneDomain(
        {
          domains: state.repo,
          dns: dns([[standaloneVerificationValue("token-123")]], ["autre.edge.test"]),
          edgeHostname: "edge.standalone.test",
        },
        { domainId: domain.id },
      ),
    ).rejects.toThrow("CNAME");
    expect(state.states.at(-1)?.verificationStatus).toBe("failed");
  });
});
