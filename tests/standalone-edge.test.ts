import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { describe, expect, it } from "vitest";
import type { StandaloneBuildStorage } from "@/application/ports/standalone-build-storage";
import type { StandaloneRepository } from "@/application/ports/standalone-repository";
import { createStandaloneEdgeServer, normalizeEdgeRequestPath } from "@/standalone/edge-server";

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

describe("proxy API same-origin", () => {
  it("proxifie /api/chat vers ONIR-CMS", async () => {
    const upstream = createHttpServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += String(chunk);
      });
      request.on("end", () => {
        response.writeHead(201, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ path: request.url, method: request.method, body }));
      });
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const upstreamAddress = upstream.address();
    if (upstreamAddress === null || typeof upstreamAddress === "string") throw new Error("port");
    const edge = createStandaloneEdgeServer({
      mappings: {
        findActiveMappingByHostname: async () => ({
          hostname: "client.example",
          chatLinkId: "912bffda-2445-4a76-bfc6-957984edfca4",
          organizationId: "00000000-0000-0000-0000-000000000025",
          buildId: "0ca09b49-49e5-4e44-aa58-9f2a3b4a3af0",
          artifactKey:
            "standalone-builds/912bffda-2445-4a76-bfc6-957984edfca4/0ca09b49-49e5-4e44-aa58-9f2a3b4a3af0",
          artifactSha256: "sha256:test",
        }),
      } as Pick<StandaloneRepository, "findActiveMappingByHostname">,
      storage: {
        get: async () => null,
        put: async () => undefined,
        remove: async () => undefined,
      } as StandaloneBuildStorage,
      apiOrigin: `http://127.0.0.1:${upstreamAddress.port}`,
    });
    await new Promise<void>((resolve) => edge.listen(0, "127.0.0.1", resolve));
    const edgeAddress = edge.address();
    if (edgeAddress === null || typeof edgeAddress === "string") throw new Error("port");

    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port: edgeAddress.port,
          path: "/api/chat/session",
          method: "POST",
          headers: { host: "client.example", "content-type": "application/json" },
        },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify({ token: "test" }));
    });

    await new Promise<void>((resolve) => edge.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    expect(result.status).toBe(201);
    expect(JSON.parse(result.body)).toEqual({
      path: "/api/chat/session",
      method: "POST",
      body: JSON.stringify({ token: "test" }),
    });
  });
});
