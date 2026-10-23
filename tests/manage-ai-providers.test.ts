import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ValidationError } from "@/application/errors";
import {
  archiveAiProvider,
  createAiProvider,
  listAiProviders,
  updateAiProvider,
} from "@/application/use-cases/ai/manage-ai-providers";
import { memoryAiProviderRepository, testActor } from "./helpers/ai-provider-memory";

const ORIGINAL_KEY = process.env.AI_PROVIDER_KEY;

beforeEach(() => {
  process.env.AI_PROVIDER_KEY = "a".repeat(64);
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.AI_PROVIDER_KEY;
  else process.env.AI_PROVIDER_KEY = ORIGINAL_KEY;
});

function deps() {
  const memory = memoryAiProviderRepository();
  return { ...memory, deps: { providers: memory.repo } };
}

describe("manage-ai-providers — CRUD", () => {
  it("crée un fournisseur avec une clé chiffrée et un indice", async () => {
    const { deps: d, keys } = deps();
    const provider = await createAiProvider(d, testActor, {
      label: "OpenAI prod",
      preset: "openai",
      apiKey: "sk-proj-1234567890",
      defaultModel: "gpt-4o-mini",
    });
    expect(provider.baseUrl).toBe("https://api.openai.com/v1");
    expect(provider.apiKeyHint).toBe("••••7890");
    expect(provider.defaultModel).toBe("gpt-4o-mini");
    expect(keys.get(provider.id)?.ciphertext).not.toContain("sk-proj");
  });

  it("construit l'URL Infomaniak depuis le product id", async () => {
    const { deps: d } = deps();
    const provider = await createAiProvider(d, testActor, {
      label: "Infomaniak",
      preset: "infomaniak",
      productId: "12345",
      apiKey: "token",
    });
    expect(provider.baseUrl).toBe("https://api.infomaniak.com/2/ai/12345/openai/v1");
    expect(provider.dialect).toBe("infomaniak");
  });

  it("refuse un doublon de nom", async () => {
    const { deps: d } = deps();
    await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    await expect(
      createAiProvider(d, testActor, {
        label: "openai",
        preset: "openai",
        apiKey: "sk-123456",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuse une URL privée sans opt-in", async () => {
    const { deps: d } = deps();
    await expect(
      createAiProvider(d, testActor, {
        label: "Local",
        preset: "custom",
        baseUrl: "http://127.0.0.1:11434/v1",
        apiKey: "x",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("met à jour sans réécrire la clé si elle est vide", async () => {
    const { deps: d, keys } = deps();
    const created = await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    const before = keys.get(created.id)?.ciphertext;
    const updated = await updateAiProvider(d, testActor, created.id, {
      label: "OpenAI 2",
      defaultModel: "gpt-4.1",
    });
    expect(updated.label).toBe("OpenAI 2");
    expect(keys.get(created.id)?.ciphertext).toBe(before);
  });

  it("remplace la clé quand une nouvelle est fournie", async () => {
    const { deps: d, keys } = deps();
    const created = await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    const before = keys.get(created.id)?.ciphertext;
    await updateAiProvider(d, testActor, created.id, { apiKey: "sk-999999" });
    expect(keys.get(created.id)?.ciphertext).not.toBe(before);
  });

  it("refuse d'archiver un fournisseur utilisé par un lien", async () => {
    const { deps: d, setLinksUsing } = deps();
    const created = await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    setLinksUsing(created.id, 2);
    await expect(archiveAiProvider(d, testActor, created.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuse d'archiver le défaut de l'organisation", async () => {
    const { deps: d, setSettings } = deps();
    const created = await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    setSettings({
      organizationId: "org-1",
      defaultProviderId: created.id,
      defaultModel: "gpt-4o-mini",
      updatedAt: new Date().toISOString(),
    });
    await expect(archiveAiProvider(d, testActor, created.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("archive un fournisseur libre", async () => {
    const { deps: d } = deps();
    const created = await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    const archived = await archiveAiProvider(d, testActor, created.id);
    expect(archived.archivedAt).not.toBeNull();
    expect(await listAiProviders(d, testActor)).toHaveLength(0);
    expect(await listAiProviders(d, testActor, { includeArchived: true })).toHaveLength(1);
  });
});
