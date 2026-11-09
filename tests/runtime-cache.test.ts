import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import { RuntimeCache } from "@/infrastructure/cache/runtime-cache";
import {
  cachedChatbotConfigRepository,
  cachedConnaissanceRepository,
} from "@/infrastructure/db/runtime-cache-repositories";
import type { RuntimeCacheConfig } from "@/lib/env";

const CACHE_CONFIG: RuntimeCacheConfig = {
  enabled: true,
  url: undefined,
  centralUrl: undefined,
  prefix: "test:runtime",
  configTtlMs: 60_000,
  linkConfigTtlMs: 30_000,
  knowledgeTtlMs: 30_000,
  mediaTtlMs: 30_000,
};

const CONFIG = {
  id: "cfg-1",
  organizationId: "org-1",
  chatLinkId: "link-1",
  version: 1,
  behaviorMode: "guided",
  systemPrompt: "",
  simple: {},
  fiches: [],
  dataSelection: { mode: "all", connaissanceIds: [], mediaIds: [] },
  fallback: {},
  searchTool: {},
  createdBy: null,
  createdAt: "2026-01-01T00:00:00.000Z",
} as never;

afterEach(() => {
  vi.useRealTimers();
});

describe("cache runtime", () => {
  it("sert depuis la mémoire et respecte le TTL", async () => {
    vi.useFakeTimers();
    const cache = new RuntimeCache(CACHE_CONFIG);
    await cache.setJson("k", { value: 1 }, 1_000);
    await expect(cache.getJson("k")).resolves.toEqual({ value: 1 });
    vi.advanceTimersByTime(1_001);
    await expect(cache.getJson("k")).resolves.toBeNull();
  });

  it("ne rappelle pas PostgreSQL pour une config immuable", async () => {
    const cache = new RuntimeCache(CACHE_CONFIG);
    let calls = 0;
    const base: ChatbotConfigRepository = {
      currentForLink: async () => null,
      findById: async () => {
        calls += 1;
        return CONFIG;
      },
      listVersions: async () => [],
      createVersion: async () => CONFIG,
    };
    const repo = cachedChatbotConfigRepository(base, cache);
    await repo.findById("org-1", "cfg-1");
    await repo.findById("org-1", "cfg-1");
    expect(calls).toBe(1);
  });

  it("invalide la liste de connaissances après une écriture", async () => {
    const cache = new RuntimeCache(CACHE_CONFIG);
    let calls = 0;
    const item = {
      id: "k1",
      organizationId: "org-1",
      titre: "Titre",
      contenu: "Contenu",
      chatLinkIds: [],
      actif: true,
      createdBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const items = [item];
    const base: ConnaissanceRepository = {
      findById: async () => null,
      findByTitre: async () => null,
      list: async () => items,
      listActivesForChatLink: async () => {
        calls += 1;
        return items;
      },
      create: async () => item,
      update: async () => item,
      delete: async () => true,
      deleteMany: async () => 1,
    };
    const repo = cachedConnaissanceRepository(base, cache);
    await repo.listActivesForChatLink?.("org-1", "link-1");
    await repo.listActivesForChatLink?.("org-1", "link-1");
    expect(calls).toBe(1);
    await repo.update("org-1", "k1", { titre: "Modifié" });
    await repo.listActivesForChatLink?.("org-1", "link-1");
    expect(calls).toBe(2);
  });
});
