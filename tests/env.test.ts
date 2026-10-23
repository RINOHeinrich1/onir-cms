import { afterEach, describe, expect, it } from "vitest";
import {
  aiConfig,
  aiProviderKey,
  allowPrivateAiNetworks,
  appUrl,
  databaseUrl,
  env,
  legacyAiCredentials,
  sessionSecret,
} from "@/lib/env";

const KEYS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "APP_URL",
  "AI_API_TOKEN",
  "AI_PRODUCT_ID",
  "AI_MODEL",
  "AI_PROVIDER_KEY",
  "AI_ALLOW_PRIVATE_NETWORKS",
  "CHECK_FOO",
] as const;

const original = new Map<string, string | undefined>();
for (const key of KEYS) original.set(key, process.env[key]);

afterEach(() => {
  for (const key of KEYS) {
    const value = original.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("env — lecture centralisée", () => {
  it("env() renvoie undefined si absent ou vide", () => {
    delete process.env.CHECK_FOO;
    expect(env("CHECK_FOO")).toBeUndefined();

    process.env.CHECK_FOO = "   ";
    expect(env("CHECK_FOO")).toBeUndefined();

    process.env.CHECK_FOO = "bar";
    expect(env("CHECK_FOO")).toBe("bar");
  });

  it("databaseUrl() échoue si absent", () => {
    delete process.env.DATABASE_URL;
    expect(() => databaseUrl()).toThrow();
  });

  it("databaseUrl() lit la valeur fournie", () => {
    process.env.DATABASE_URL = "postgres://onir_cms:secret@127.0.0.1:5433/db";
    expect(databaseUrl()).toBe("postgres://onir_cms:secret@127.0.0.1:5433/db");
  });

  it("sessionSecret() échoue si absent", () => {
    delete process.env.SESSION_SECRET;
    expect(() => sessionSecret()).toThrow();
  });

  it("appUrl() propose un défaut local", () => {
    delete process.env.APP_URL;
    expect(appUrl()).toBe("http://localhost:3008");
  });

  it("aiConfig() applique le modèle par défaut", () => {
    process.env.AI_API_TOKEN = "token";
    process.env.AI_PRODUCT_ID = "product";
    delete process.env.AI_MODEL;
    expect(aiConfig()).toEqual({
      token: "token",
      productId: "product",
      model: "Qwen/Qwen3.5-122B-A10B-FP8",
    });
  });

  it("aiConfig() échoue si le token manque", () => {
    delete process.env.AI_API_TOKEN;
    expect(() => aiConfig()).toThrow();
  });

  it("legacyAiCredentials() renvoie null si la config est incomplète", () => {
    process.env.AI_API_TOKEN = "token";
    delete process.env.AI_PRODUCT_ID;
    expect(legacyAiCredentials()).toBeNull();
    delete process.env.AI_API_TOKEN;
    process.env.AI_PRODUCT_ID = "product";
    expect(legacyAiCredentials()).toBeNull();
  });

  it("legacyAiCredentials() conserve le défaut de modèle", () => {
    process.env.AI_API_TOKEN = "token";
    process.env.AI_PRODUCT_ID = "product";
    delete process.env.AI_MODEL;
    expect(legacyAiCredentials()).toEqual({
      token: "token",
      productId: "product",
      model: "Qwen/Qwen3.5-122B-A10B-FP8",
    });
  });

  it("aiProviderKey() exige 64 caractères hexadécimaux", () => {
    delete process.env.AI_PROVIDER_KEY;
    expect(() => aiProviderKey()).toThrow();
    process.env.AI_PROVIDER_KEY = "abc";
    expect(() => aiProviderKey()).toThrow();
    process.env.AI_PROVIDER_KEY = "a".repeat(64);
    expect(aiProviderKey()).toHaveLength(32);
  });

  it("allowPrivateAiNetworks() est opt-in strict", () => {
    delete process.env.AI_ALLOW_PRIVATE_NETWORKS;
    expect(allowPrivateAiNetworks()).toBe(false);
    process.env.AI_ALLOW_PRIVATE_NETWORKS = "true";
    expect(allowPrivateAiNetworks()).toBe(true);
    process.env.AI_ALLOW_PRIVATE_NETWORKS = "1";
    expect(allowPrivateAiNetworks()).toBe(false);
  });
});
