import { describe, expect, it } from "vitest";
import type { StandaloneRuntimeConfig } from "@/domain/standalone";
import {
  renderStandaloneIndexHtml,
  renderStandaloneManifest,
  renderStandaloneManifestJson,
  type StandaloneArtifactInput,
} from "@/domain/standalone-artifact";

const config = {
  version: 1,
  chatApiBaseUrl: "https://api.onir-cms.test/api/chat",
  token: "public-token",
  template: {
    id: "template-id",
    versionId: "version-id",
    version: "1.0.0",
    mode: "web-component",
    entryUrl: "./template/index.js",
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

const input: StandaloneArtifactInput = {
  buildId: "0ca09b49-49e5-4e44-aa58-9f2a3b4a3af0",
  chatLinkId: "912bffda-2445-4a76-bfc6-957984edfca4",
  organizationId: "00000000-0000-0000-0000-000000000025",
  configHash: "sha256:config",
  createdAt: "2026-11-23T18:00:00.000Z",
  title: "Test <script>",
  config,
};

describe("artefact standalone", () => {
  it("génère un shell sans Next et échappe le JSON injecté", () => {
    const html = renderStandaloneIndexHtml({
      ...input,
      config: {
        ...config,
        token: "</script><script>alert(1)</script>",
      },
    });
    expect(html).toContain('id="onir-standalone-root"');
    expect(html).toContain('src="./runtime.js"');
    expect(html).toContain('href="./runtime.css"');
    expect(html).toContain("Test &lt;script&gt;");
    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).toContain("\\u003c/script\\u003e");
  });

  it("produit un manifeste stable", () => {
    expect(renderStandaloneManifest(input)).toMatchObject({
      version: 1,
      buildId: input.buildId,
      chatLinkId: input.chatLinkId,
      templateId: "template-id",
      templateVersion: "1.0.0",
      configHash: "sha256:config",
      entry: "index.html",
      runtime: { js: "runtime.js", css: "runtime.css" },
    });
    expect(JSON.parse(renderStandaloneManifestJson(input))).toEqual(
      renderStandaloneManifest(input),
    );
  });
});
