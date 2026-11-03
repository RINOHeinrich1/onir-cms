import { describe, expect, it, vi } from "vitest";
import type { auditLegacyChatbots } from "@/infrastructure/db/audit-legacy-chatbots";
import {
  formatLegacyBatchResult,
  migrateAllLegacyChatbots,
} from "@/infrastructure/db/migrate-all-legacy-chatbots";
import type { migrateLegacyChatbot } from "@/infrastructure/db/migrate-legacy-chatbot";
import type { planLegacyChatbotMigration } from "@/infrastructure/db/plan-legacy-chatbot-migration";

type Audit = Awaited<ReturnType<typeof auditLegacyChatbots>>;
type Plan = Awaited<ReturnType<typeof planLegacyChatbotMigration>>;
type Migration = Awaited<ReturnType<typeof migrateLegacyChatbot>>;

const LINK = {
  id: "link-1",
  organization: "Onirtech",
  label: "Ancien chatbot",
  templateKey: "fiche-projet",
  templateVersion: 2,
  blocking: false,
  openConversations: 0,
};

function audit(legacy: number, links = [LINK]): Audit {
  return {
    summary: { legacyLinks: legacy },
    links,
  } as unknown as Audit;
}

function plan(overrides: Record<string, unknown> = {}): Plan {
  return {
    link: { alreadyConfigured: false, openConversations: 0 },
    blockers: [],
    warnings: [],
    proposedConfig: { behaviorMode: "expert", fiches: [{}] },
    ...overrides,
  } as unknown as Plan;
}

function migration(): Migration {
  return {
    linkId: LINK.id,
    configId: "cfg-1",
    version: 1,
    contentScope: { connaissancesUpdated: 0, mediasUpdated: 0 },
  };
}

describe("migration de masse des chatbots legacy", () => {
  it("dry-run : planifie sans écrire", async () => {
    const migrate = vi.fn();
    const result = await migrateAllLegacyChatbots(
      {} as never,
      {},
      {
        audit: (async () => audit(1)) as unknown as typeof auditLegacyChatbots,
        plan: (async () => plan()) as unknown as typeof planLegacyChatbotMigration,
        migrate: migrate as unknown as typeof migrateLegacyChatbot,
      },
    );
    expect(result.planned).toBe(1);
    expect(result.migrated).toBe(0);
    expect(result.entries[0]?.status).toBe("planned");
    expect(migrate).not.toHaveBeenCalled();
    expect(result.remainingLegacy).toBe(1);
  });

  it("execute avec --allow-open : migre et recalcule le reste", async () => {
    const auditFn = vi
      .fn()
      .mockResolvedValueOnce(audit(1, [{ ...LINK, openConversations: 1 }]))
      .mockResolvedValueOnce(audit(0, []));
    const migrate = vi.fn(async () => migration());
    const result = await migrateAllLegacyChatbots(
      {} as never,
      { execute: true, allowOpenConversations: true },
      {
        audit: auditFn as unknown as typeof auditLegacyChatbots,
        plan: (async () =>
          plan({
            link: { alreadyConfigured: false, openConversations: 1 },
          })) as unknown as typeof planLegacyChatbotMigration,
        migrate: migrate as unknown as typeof migrateLegacyChatbot,
      },
    );
    expect(result.migrated).toBe(1);
    expect(result.entries[0]?.configId).toBe("cfg-1");
    expect(migrate).toHaveBeenCalledWith({} as never, "link-1", {
      allowOpenConversations: true,
    });
    expect(result.remainingLegacy).toBe(0);
  });

  it("bloque un lien sans configuration proposée", async () => {
    const migrate = vi.fn();
    const result = await migrateAllLegacyChatbots(
      {} as never,
      { execute: true },
      {
        audit: (async () => audit(1)) as unknown as typeof auditLegacyChatbots,
        plan: (async () =>
          plan({
            proposedConfig: null,
            blockers: ["Template introuvable"],
          })) as unknown as typeof planLegacyChatbotMigration,
        migrate: migrate as unknown as typeof migrateLegacyChatbot,
      },
    );
    expect(result.blocked).toBe(1);
    expect(result.entries[0]?.blockers).toContain("Template introuvable");
    expect(migrate).not.toHaveBeenCalled();
  });

  it("isole les échecs d'un lien", async () => {
    const result = await migrateAllLegacyChatbots(
      {} as never,
      { execute: true },
      {
        audit: (async () => audit(1)) as unknown as typeof auditLegacyChatbots,
        plan: (async () => plan()) as unknown as typeof planLegacyChatbotMigration,
        migrate: (async () => {
          throw new Error("échec simulé");
        }) as unknown as typeof migrateLegacyChatbot,
      },
    );
    expect(result.failed).toBe(1);
    expect(result.entries[0]?.blockers).toContain("échec simulé");
  });

  it("formate le rapport", () => {
    const report = formatLegacyBatchResult({
      generatedAt: "2026-11-03T00:00:00.000Z",
      execute: false,
      allowOpenConversations: false,
      totalLegacy: 1,
      migrated: 0,
      planned: 1,
      blocked: 0,
      skipped: 0,
      failed: 0,
      remainingLegacy: 1,
      entries: [
        {
          linkId: "link-1",
          organization: "Onirtech",
          label: "Ancien chatbot",
          templateKey: "fiche-projet",
          templateVersion: 2,
          status: "planned",
          configId: null,
          version: null,
          blockers: [],
          warnings: [],
        },
      ],
    });
    expect(report).toContain("dry-run");
    expect(report).toContain("[planned] Onirtech — Ancien chatbot (fiche-projet v2)");
    expect(report).toContain("Liens legacy restants : 1");
  });
});
