import { describe, expect, it } from "vitest";
import { renderIframeFrame } from "@/infrastructure/templates/iframe-frame";

describe("renderIframeFrame", () => {
  it("génère un document hôte avec pont data/actions", () => {
    const html = renderIframeFrame({
      title: "Template",
      entry: "dist/index.js",
      integrity: "sha256-abc",
      element: "onirtech-template-test",
      versionRoot: "/api/template-assets/tpl-1/1.0.0/",
    });
    expect(html).toContain('<base href="/api/template-assets/tpl-1/1.0.0/dist/">');
    expect(html).toContain('src="index.js"');
    expect(html).toContain('integrity="sha256-abc"');
    expect(html).toContain("loadData");
    expect(html).toContain("onirtech-template-test");
    expect(html).toContain("dataResult");
  });

  it("échappe le titre et les attributs", () => {
    const html = renderIframeFrame({
      title: '<script>alert("x")</script>',
      entry: "index.js",
      integrity: "sha256-abc",
      element: "onirtech-template-test",
      versionRoot: "/api/template-assets/tpl-1/1.0.0/",
    });
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;alert");
  });
});
