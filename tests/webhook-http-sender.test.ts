import { createHash, createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WebhookHttpRequest } from "@/application/ports/webhook-sender";
import type { WebhookEndpoint } from "@/domain/entities/webhook";
import { httpWebhookSender } from "@/infrastructure/webhooks/http-sender";

const received: Array<{ url: string; headers: http.IncomingHttpHeaders; body: string }> = [];
let server: http.Server;
let baseUrl = "";

const ENDPOINT: WebhookEndpoint = {
  id: "77777777-7777-4777-8777-777777777777",
  organizationId: "22222222-2222-4222-8222-222222222222",
  templateKey: "lead-demo",
  name: "Test local",
  description: "",
  enabled: true,
  httpMethod: "POST",
  url: "http://127.0.0.1/hook",
  queryParams: [],
  headers: [],
  bodyMode: "json",
  bodyTemplate: "",
  fieldMappings: [],
  auth: { type: "none" },
  timeoutMs: 5000,
  maxAttempts: 1,
  retryBackoffMs: 1000,
  followRedirects: false,
  tlsVerify: true,
  allowInsecureHttp: true,
  allowPrivateNetwork: true,
  createdBy: null,
  createdAt: "2026-10-26T10:00:00.000Z",
  updatedAt: "2026-10-26T10:00:00.000Z",
  deletedAt: null,
};

function request(url: string, body: string): WebhookHttpRequest {
  return {
    method: "POST",
    url,
    headers: { "Content-Type": "application/json", "X-Test": "yes" },
    body: Buffer.from(body),
    contentType: "application/json",
    timeoutMs: 5000,
    followRedirects: false,
    tlsVerify: true,
    allowPrivateNetwork: true,
  };
}

describe("webhook HTTP sender", () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        received.push({ url: req.url ?? "", headers: req.headers, body });
        if (req.url === "/redirect") {
          res.writeHead(302, { Location: "http://localhost/hook" });
          res.end();
          return;
        }
        if (req.url === "/fail") {
          res.writeHead(503, { "Content-Type": "text/plain" });
          res.end("indisponible");
          return;
        }
        if (req.url === "/token") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ access_token: "oauth-token", expires_in: 3600 }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, body }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("envoie la requête avec le lookup épinglé", async () => {
    const result = await httpWebhookSender().send(
      ENDPOINT,
      request(`${baseUrl}/hook`, '{"hello":"world"}'),
    );
    expect(result.status).toBe(200);
    expect(received.at(-1)?.body).toBe('{"hello":"world"}');
    expect(received.at(-1)?.headers["x-test"]).toBe("yes");
    expect(received.at(-1)?.headers["content-length"]).toBe("17");
  });

  it("retourne un 503 sans lever d'erreur réseau", async () => {
    const result = await httpWebhookSender().send(ENDPOINT, request(`${baseUrl}/fail`, "{}"));
    expect(result.status).toBe(503);
    expect(result.body).toBe("indisponible");
  });

  it("applique Bearer, Basic, API key et OAuth2", async () => {
    const url = `${baseUrl}/hook`;
    const sender = httpWebhookSender();
    await sender.send(
      { ...ENDPOINT, id: "bearer", auth: { type: "bearer", token: "tok" } },
      request(url, "{}"),
    );
    expect(received.at(-1)?.headers.authorization).toBe("Bearer tok");

    await sender.send(
      {
        ...ENDPOINT,
        id: "basic",
        auth: { type: "basic", username: "u", password: "p" },
      },
      request(url, "{}"),
    );
    expect(received.at(-1)?.headers.authorization).toBe(
      `Basic ${Buffer.from("u:p").toString("base64")}`,
    );

    await sender.send(
      {
        ...ENDPOINT,
        id: "api-header",
        auth: { type: "api_key_header", headerName: "X-Api-Key", key: "secret" },
      },
      request(url, "{}"),
    );
    expect(received.at(-1)?.headers["x-api-key"]).toBe("secret");

    await sender.send(
      {
        ...ENDPOINT,
        id: "api-query",
        auth: { type: "api_key_query", paramName: "api_key", key: "secret" },
      },
      request(url, "{}"),
    );
    expect(received.at(-1)?.url).toBe("/hook?api_key=secret");

    await sender.send(
      {
        ...ENDPOINT,
        id: "oauth",
        auth: {
          type: "oauth2_client_credentials",
          tokenUrl: `${baseUrl}/token`,
          clientId: "id",
          clientSecret: "secret",
          scope: "read",
        },
      },
      request(url, "{}"),
    );
    expect(received.at(-1)?.headers.authorization).toBe("Bearer oauth-token");
  });

  it("signe le corps en HMAC", async () => {
    const body = '{"a":1}';
    const url = `${baseUrl}/hook`;
    await httpWebhookSender().send(
      { ...ENDPOINT, id: "hmac", auth: { type: "hmac", secret: "hmac-secret" } },
      request(url, body),
    );
    const entry = received.at(-1);
    const timestamp = entry?.headers["x-onir-timestamp"];
    const signature = entry?.headers["x-onir-signature"];
    expect(typeof timestamp).toBe("string");
    expect(typeof signature).toBe("string");
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const canonical = `POST\n${url}\n${timestamp ?? ""}\n${bodyHash}`;
    const expected = createHmac("sha256", "hmac-secret").update(canonical).digest("hex");
    expect(signature).toBe(`sha256=${expected}`);
  });

  it("refuse une redirection vers un autre hostname", async () => {
    await expect(
      httpWebhookSender().send(
        { ...ENDPOINT, followRedirects: true },
        {
          ...request(`${baseUrl}/redirect`, "{}"),
          followRedirects: true,
        },
      ),
    ).rejects.toThrow(/cross-origin/);
  });
});
