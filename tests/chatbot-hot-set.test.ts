import { describe, expect, it, vi } from "vitest";
import { warmChatbotCache } from "@/infrastructure/cache/chatbot-cache-warmer";
import { ChatbotHotSet, type HotSetStore } from "@/infrastructure/cache/chatbot-hot-set";

function fakeStore() {
  const scores = new Map<string, number>();
  const configIds = new Map<string, string>();
  const deletedKeys: string[] = [];
  const purgedPrefixes: string[] = [];
  const store: HotSetStore = {
    key: (...parts) => parts.join(":"),
    prefixFor: (...parts) => parts.join(":"),
    async touchHotMember(_indexKey, member, score, limit) {
      scores.set(member, score);
      if (scores.size <= limit) return null;
      const [oldest] = [...scores.entries()].sort((a, b) => a[1] - b[1])[0] ?? [];
      if (oldest === undefined) return null;
      scores.delete(oldest);
      return oldest;
    },
    async setHotConfig(_mapKey, member, configId) {
      configIds.set(member, configId);
    },
    async getHotConfig(_mapKey, member) {
      return configIds.get(member) ?? null;
    },
    async deleteHotConfig(_mapKey, member) {
      configIds.delete(member);
    },
    async deleteLocalKey(key) {
      deletedKeys.push(key);
    },
    async invalidateLocalPrefix(prefix) {
      purgedPrefixes.push(prefix);
    },
  };
  return { store, scores, configIds, deletedKeys, purgedPrefixes };
}

describe("hot set LRU des chatbots (ADR-0094)", () => {
  it("remplit sans évincer tant que la capacité n'est pas atteinte", async () => {
    const fake = fakeStore();
    const hot = new ChatbotHotSet(fake.store, 2);
    await hot.touch("org-1", "link-1", "cfg-1", 1);
    await hot.touch("org-1", "link-2", "cfg-2", 2);
    expect([...fake.scores.keys()]).toEqual(["org-1:link-1", "org-1:link-2"]);
    expect(fake.deletedKeys).toEqual([]);
  });

  it("évince le moins récemment utilisé au-delà de la capacité", async () => {
    const fake = fakeStore();
    const hot = new ChatbotHotSet(fake.store, 2);
    await hot.touch("org-1", "link-1", "cfg-1", 1);
    await hot.touch("org-1", "link-2", "cfg-2", 2);
    await hot.touch("org-1", "link-3", "cfg-3", 3);

    expect([...fake.scores.keys()]).toEqual(["org-1:link-2", "org-1:link-3"]);
    expect(fake.configIds.has("org-1:link-1")).toBe(false);
    expect(fake.deletedKeys).toContain("config:org-1:cfg-1");
    expect(fake.purgedPrefixes).toEqual(
      expect.arrayContaining([
        "link-config:org-1:link-1",
        "knowledge:org-1:link-1",
        "media:org-1:link-1",
      ]),
    );
  });

  it("met à jour le score sans changer la taille", async () => {
    const fake = fakeStore();
    const hot = new ChatbotHotSet(fake.store, 2);
    await hot.touch("org-1", "link-1", "cfg-1", 1);
    await hot.touch("org-1", "link-2", "cfg-2", 2);
    await hot.touch("org-1", "link-1", "cfg-1", 3);
    expect(fake.scores.get("org-1:link-1")).toBe(3);
    expect(fake.scores.size).toBe(2);
  });

  it("ne fait rien si la capacité est nulle", async () => {
    const fake = fakeStore();
    const hot = new ChatbotHotSet(fake.store, 0);
    await hot.touch("org-1", "link-1", "cfg-1");
    expect(fake.scores.size).toBe(0);
  });
});

describe("warm-up des chatbots (ADR-0094)", () => {
  it("précharge les configurations des liens récents", async () => {
    const fake = fakeStore();
    const hot = new ChatbotHotSet(fake.store, 10);
    const findById = vi.fn(async (_org: string, configId: string) => ({
      id: configId,
      organizationId: "org-1",
    }));
    const touch = vi.spyOn(hot, "touch");
    const warmed = await warmChatbotCache({
      links: {
        listRecentlyActive: async () => [
          { organizationId: "org-1", id: "link-1", currentConfigId: "cfg-1" },
          { organizationId: "org-1", id: "link-2", currentConfigId: "cfg-2" },
        ],
      },
      configs: { findById } as never,
      hotSet: hot,
      limit: 10,
    });

    expect(warmed).toBe(2);
    expect(findById).toHaveBeenCalledTimes(2);
    expect(touch).toHaveBeenNthCalledWith(1, "org-1", "link-1", "cfg-1", expect.any(Number));
    expect(touch).toHaveBeenNthCalledWith(2, "org-1", "link-2", "cfg-2", expect.any(Number));
  });

  it("ignore les liens sans configuration", async () => {
    const fake = fakeStore();
    const hot = new ChatbotHotSet(fake.store, 10);
    const warmed = await warmChatbotCache({
      links: {
        listRecentlyActive: async () => [
          { organizationId: "org-1", id: "link-1", currentConfigId: null },
        ],
      },
      configs: { findById: vi.fn() } as never,
      hotSet: hot,
      limit: 10,
    });
    expect(warmed).toBe(0);
  });
});
