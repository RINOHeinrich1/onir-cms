import { describe, expect, it } from "vitest";
import { normalizeEdgeRequestPath } from "@/standalone/edge-server";

describe("edge standalone", () => {
  it("résout la racine et les index de dossier", () => {
    expect(normalizeEdgeRequestPath("/")).toBe("index.html");
    expect(normalizeEdgeRequestPath("/foo/")).toBe("foo/index.html");
    expect(normalizeEdgeRequestPath("/foo/index.html")).toBe("foo/index.html");
  });

  it("résout les assets", () => {
    expect(normalizeEdgeRequestPath("/runtime.js")).toBe("runtime.js");
    expect(normalizeEdgeRequestPath("/template/dist/index.js")).toBe("template/dist/index.js");
  });

  it("refuse les traversées et caractères dangereux", () => {
    expect(normalizeEdgeRequestPath("/../secret")).toBeNull();
    expect(normalizeEdgeRequestPath("/%2e%2e/secret")).toBeNull();
    expect(normalizeEdgeRequestPath("/a%5Cb")).toBeNull();
    expect(normalizeEdgeRequestPath("/a%00b")).toBeNull();
  });
});
