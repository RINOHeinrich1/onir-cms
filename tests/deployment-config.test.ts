import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDeploymentConfig,
  realtimeMode,
  replicaCount,
  s3Config,
  storageDriver,
} from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuration de déploiement", () => {
  it("reste en disque/local en mono sans S3 ni Valkey", () => {
    vi.stubEnv("STORAGE_DRIVER", "auto");
    vi.stubEnv("REPLICA_COUNT", "1");
    vi.stubEnv("REALTIME_MODE", "auto");
    expect(storageDriver()).toBe("disk");
    expect(realtimeMode()).toBe("local");
    expect(replicaCount()).toBe(1);
  });

  it("bascule en S3/Valkey quand configuré", () => {
    vi.stubEnv("STORAGE_DRIVER", "auto");
    vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:8333");
    vi.stubEnv("S3_BUCKET", "onir-cms");
    vi.stubEnv("S3_ACCESS_KEY_ID", "key");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("REALTIME_MODE", "auto");
    vi.stubEnv("VALKEY_URL", "redis://127.0.0.1:6379");
    expect(storageDriver()).toBe("s3");
    expect(s3Config()?.forcePathStyle).toBe(true);
    expect(realtimeMode()).toBe("valkey");
  });

  it("refuse le disque et le SSE local en multi-instance", () => {
    vi.stubEnv("REPLICA_COUNT", "2");
    vi.stubEnv("STORAGE_DRIVER", "disk");
    vi.stubEnv("REALTIME_MODE", "local");
    expect(() => assertDeploymentConfig()).toThrow();
  });

  it("bascule en polling en multi sans Valkey", () => {
    vi.stubEnv("REPLICA_COUNT", "2");
    vi.stubEnv("STORAGE_DRIVER", "s3");
    vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:8333");
    vi.stubEnv("S3_BUCKET", "onir-cms");
    vi.stubEnv("S3_ACCESS_KEY_ID", "key");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("REALTIME_MODE", "auto");
    expect(realtimeMode()).toBe("polling");
    expect(() => assertDeploymentConfig()).not.toThrow();
  });
});
