import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StandaloneBuildStorage } from "@/application/ports/standalone-build-storage";
import type { StandaloneRepository } from "@/application/ports/standalone-repository";
import { persistStandaloneArtifact } from "@/application/use-cases/standalone/persist-artifact";
import type { StandaloneRuntimeConfig } from "@/domain/standalone";

const config = {
  version: 1,
  chatApiBaseUrl: "https://api.onir-cms.test/api/chat",
  token: "public-token",
  template: {
    id: "template-id",
    versionId: "version-id",
    version: "1.0.0",
    mode: "web-component",
    entryUrl: "/api/template-assets/template/1.0.0/dist/index.js",
    element: "onir-template",
    capabilities: [],
    params: [],
    dataContracts: [],
  },
  context: {
    link: { label: "Test" },
    params: {},
    state: { phase: "identity", status: "en_cours" },
    resources: {},
    theme: {},
    capabilities: [],
  },
  conversationId: null,
  initialMessages: [],
  anonymous: false,
} as unknown as StandaloneRuntimeConfig;

const buildId = "0ca09b49-49e5-4e44-aa58-9f2a3b4a3af0";
const chatLinkId = "912bffda-2445-4a76-bfc6-957984edfca4";
const organizationId = "00000000-0000-0000-0000-000000000025";

describe("persistance d'un build standalone", () => {
  let objects: Map<string, Uint8Array>;
  let storage: StandaloneBuildStorage;
  let markBuildReady: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    objects = new Map();
    storage = {
      put: vi.fn(async ({ key, data }) => {
        objects.set(key, data);
      }),
      get: vi.fn(async () => null),
      remove: vi.fn(async (key) => {
        objects.delete(key);
      }),
    };
    markBuildReady = vi.fn(
      async (input: { id: string; artifactKey: string; artifactSha256: string }) => ({
        id: input.id,
        status: "ready" as const,
      }),
    );
  });

  it("écrit tous les fichiers et marque le build prêt", async () => {
    const result = await persistStandaloneArtifact(
      {
        storage,
        builds: { markBuildReady } as unknown as Pick<StandaloneRepository, "markBuildReady">,
      },
      {
        buildId,
        chatLinkId,
        organizationId,
        configHash: "sha256:config",
        createdAt: "2026-11-23T18:00:00.000Z",
        config,
        templateEntryPath: "dist/index.js",
        runtimeJs: new Uint8Array([1]),
        runtimeCss: new Uint8Array([2]),
        templateFiles: [
          { path: "dist/index.js", contentType: "text/javascript", data: new Uint8Array([3]) },
        ],
      },
    );

    expect(result.artifactKey).toBe(`standalone-builds/${chatLinkId}/${buildId}`);
    expect(result.artifactSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(objects.has(`${result.artifactKey}/index.html`)).toBe(true);
    expect(objects.has(`${result.artifactKey}/template/dist/index.js`)).toBe(true);
    expect(markBuildReady).toHaveBeenCalledWith({
      id: buildId,
      artifactKey: result.artifactKey,
      artifactSha256: result.artifactSha256,
    });
  });

  it("nettoie les objets déjà écrits en cas d'échec", async () => {
    storage.put = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(
      persistStandaloneArtifact(
        {
          storage,
          builds: { markBuildReady } as unknown as Pick<StandaloneRepository, "markBuildReady">,
        },
        {
          buildId,
          chatLinkId,
          organizationId,
          configHash: "sha256:config",
          createdAt: "2026-11-23T18:00:00.000Z",
          config,
          templateEntryPath: "dist/index.js",
          runtimeJs: new Uint8Array([1]),
          runtimeCss: new Uint8Array([2]),
          templateFiles: [],
        },
      ),
    ).rejects.toThrow("storage unavailable");
    expect(storage.remove).toHaveBeenCalled();
    expect(objects.size).toBe(0);
  });
});
