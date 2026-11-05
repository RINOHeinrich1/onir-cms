import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { createServer, type Server } from "node:http";
import { Pool } from "pg";

/**
 * Fixtures E2E ADR-0067 (P5).
 *
 * Prérequis :
 * - `E2E_DATABASE_URL` : base PostgreSQL jetable (nom contenant `test`), migrée
 *   (`npm run db:migrate`). Aucune exécution ne touche la production.
 * - `E2E_BASE_URL` : application Next démarrée sur cette base.
 * - Pour les scénarios IA : `AI_PROVIDER_KEY` (64 hex) identique à celle du
 *   serveur, afin de sceller la clé du fournisseur factice.
 *
 * Les fixtures créent leurs propres données et les suppriment via `cleanup()`.
 */

export const FICHE_KEY = "fournisseur";
export const STATUSES = [
  {
    key: "a_qualifier",
    label: "À qualifier",
    order: 0,
    isDefault: true,
    archivedAt: null,
    updatedAt: "2026-11-04T12:00:00.000Z",
  },
  {
    key: "publie",
    label: "Publié",
    order: 1,
    isDefault: false,
    archivedAt: null,
    updatedAt: "2026-11-04T12:00:00.000Z",
  },
  {
    key: "archive",
    label: "Archivé",
    order: 2,
    isDefault: false,
    archivedAt: "2026-11-03T12:00:00.000Z",
    updatedAt: "2026-11-04T12:00:00.000Z",
  },
] as const;

const DEFINITION = {
  key: FICHE_KEY,
  label: "Fournisseur",
  description: "Fournisseur E2E",
  intent: "Référencer un fournisseur",
  fields: [
    { name: "nom", label: "Nom", type: "text", required: true },
    { name: "ville", label: "Ville", type: "text", required: false },
    {
      name: "document",
      label: "Document",
      type: "file",
      required: false,
      file: { accept: ["application/pdf"], maxFiles: 1, maxBytes: 1_048_576 },
    },
  ],
  statuses: STATUSES,
  renderTemplate: "# Fournisseur\n\n- **Nom** : {{nom}}\n",
  instructions: "",
};

export type E2EFixture = {
  organizationId: string;
  adminEmail: string;
  adminPassword: string;
  linkId: string;
  linkToken: string;
  linkUrl: string;
  label: string;
  conversationId: string | null;
  ficheIds: string[];
  cleanup: () => Promise<void>;
};

export function e2eDatabaseUrl(): string {
  const url = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    throw new Error("E2E_DATABASE_URL est requis pour les fixtures ADR-0067");
  }
  const database = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(database)) {
    throw new Error(`Base E2E refusée : « ${database} » (nom sans « test »)`);
  }
  return url;
}

export function e2eBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? "http://127.0.0.1:3018";
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function cookieHeader(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  return raw.map((entry) => entry.split(";")[0]).join("; ");
}

async function api(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (init.cookie !== undefined) headers.set("Cookie", init.cookie);
  return fetch(`${e2eBaseUrl()}${path}`, { ...init, headers, redirect: "manual" });
}

export async function loginAs(email: string, password: string): Promise<string> {
  const response = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Connexion E2E impossible (${response.status})`);
  }
  const cookie = cookieHeader(response);
  if (cookie === "") throw new Error("Cookie de session absent");
  return cookie;
}

export function searchToolPayload(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    ficheTypes: [FICHE_KEY],
    statusMode: "hidden_fixed",
    fixedStatusKeys: ["publie"],
    sortMode: "fair_rotation",
    scope: "chat_link",
    ...overrides,
  };
}

export function linkPayload(label: string, searchTool: Record<string, unknown>) {
  return {
    type: "standard",
    surface: "page",
    identificationMode: "anonymous",
    label,
    sources: { connaissances: false, phototheque: false, lien: false },
    channels: {
      page: {
        enabled: true,
        identificationMode: "anonymous",
        confidentialiteId: null,
        visualTemplateId: null,
        visualTemplateVersion: null,
        visualTemplateParams: {},
        widgetConfig: { position: "bottom-right" },
      },
      widget: {
        enabled: false,
        identificationMode: "anonymous",
        confidentialiteId: null,
        visualTemplateId: null,
        visualTemplateVersion: null,
        visualTemplateParams: {},
        widgetConfig: { position: "bottom-right" },
      },
    },
    config: {
      behaviorMode: "guided",
      systemPrompt: "",
      simple: {
        role: "assistant",
        objective: "Aider le visiteur",
        language: { mode: "auto" },
        tone: "",
        guardrails: [],
        extraInstructions: "",
      },
      fiches: [DEFINITION],
      dataSelection: { mode: "all", connaissanceIds: [], mediaIds: [] },
      fallback: { enabled: false, questions: [], showCollectionForm: true },
      searchTool,
      replyMaxTokens: 400,
    },
  };
}

/** Crée org + admin + chatbot public. Renvoie les identifiants et l'URL publique. */
export async function createChatbotFixture(
  options: { withAi?: boolean; searchTool?: Record<string, unknown> } = {},
): Promise<E2EFixture> {
  const pool = new Pool({ connectionString: e2eDatabaseUrl(), max: 4 });
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const organizationName = `E2E ADR0067 ${suffix}`;
  const adminEmail = `e2e-adr0067-${suffix}@example.com`;
  const adminPassword = "E2e-password-0067!";
  const label = `Chatbot E2E ${suffix}`;

  const org = await pool.query<{ id: string }>(
    "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
    [organizationName],
  );
  const organizationId = org.rows[0]?.id;
  if (organizationId === undefined) throw new Error("Organisation E2E non créée");

  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, must_change_password, actif, is_super_admin)
     VALUES ($1, $2, 'admin', false, true, false) RETURNING id`,
    [adminEmail, hashPassword(adminPassword)],
  );
  const userId = user.rows[0]?.id;
  if (userId === undefined) throw new Error("Admin E2E non créé");
  await pool.query(
    `INSERT INTO organization_members (organization_id, user_id, role, created_by)
     VALUES ($1, $2, 'admin', $2)`,
    [organizationId, userId],
  );

  const cookie = await loginAs(adminEmail, adminPassword);
  const created = await api("/api/links", {
    method: "POST",
    cookie,
    body: JSON.stringify(linkPayload(label, searchToolPayload(options.searchTool))),
  });
  if (created.status !== 201) {
    const detail = await created.text();
    await cleanupOrg(pool, organizationId);
    await pool.end();
    throw new Error(`Création du chatbot E2E impossible (${created.status}) : ${detail}`);
  }
  const json = (await created.json()) as {
    link: { id: string };
    token: string;
    url: string;
  };

  const ficheIds = await seedFiches(pool, organizationId, json.link.id, 30);

  let conversationId: string | null = null;
  if (options.withAi === true) {
    try {
      await configureMockAi(pool, organizationId, userId, json.link.id);
      conversationId = await startPublicConversation(json.token);
    } catch (error) {
      await cleanupOrg(pool, organizationId);
      await pool.end();
      throw error;
    }
  }

  return {
    organizationId,
    adminEmail,
    adminPassword,
    linkId: json.link.id,
    linkToken: json.token,
    linkUrl: json.url,
    label,
    conversationId,
    ficheIds,
    cleanup: async () => {
      await cleanupOrg(pool, organizationId);
      await pool.end();
    },
  };
}

async function cleanupOrg(pool: Pool, organizationId: string): Promise<void> {
  await pool
    .query("DELETE FROM organizations WHERE id = $1", [organizationId])
    .catch(() => undefined);
}

async function seedFiches(
  pool: Pool,
  organizationId: string,
  linkId: string,
  count: number,
): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const status = "publie";
    const row = await pool.query<{ id: string }>(
      `INSERT INTO fiches
         (organization_id, data, definition, fiche_key, qualification_status_key)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5) RETURNING id`,
      [
        organizationId,
        JSON.stringify({
          nom: `Fournisseur ${String(index + 1).padStart(2, "0")}`,
          ville: index % 3 === 0 ? "Antananarivo" : "Toamasina",
          document: `confidentiel-${index + 1}.pdf`,
        }),
        JSON.stringify(DEFINITION),
        FICHE_KEY,
        status,
      ],
    );
    const id = row.rows[0]?.id;
    if (id === undefined) throw new Error("Fiche E2E non créée");
    await pool.query(
      `INSERT INTO fiche_chat_links (fiche_id, chat_link_id, organization_id)
       VALUES ($1, $2, $3)`,
      [id, linkId, organizationId],
    );
    ids.push(id);
  }
  return ids;
}

/** Démarre une conversation publique anonyme (API réelle). */
async function startPublicConversation(token: string): Promise<string> {
  const response = await api("/api/chat/session", {
    method: "POST",
    body: JSON.stringify({
      token,
      surface: "page",
      loadedAt: Date.now() - 5_000,
    }),
  });
  if (response.status !== 201) {
    throw new Error(`Démarrage de conversation E2E impossible (${response.status})`);
  }
  const json = (await response.json()) as { conversationId: string };
  return json.conversationId;
}

/** Scelle une clé API avec le même format que l'application (AES-256-GCM + AAD). */
function sealAiKey(plain: string): { ciphertext: string; iv: string; tag: string } {
  const hex = process.env.AI_PROVIDER_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("AI_PROVIDER_KEY (64 hex) est requis pour les E2E IA");
  }
  const key = Buffer.from(hex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("onirtech:ai-provider:v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

async function configureMockAi(
  pool: Pool,
  organizationId: string,
  userId: string,
  linkId: string,
): Promise<void> {
  const baseUrl = process.env.E2E_AI_BASE_URL;
  if (baseUrl === undefined || baseUrl.trim() === "") {
    throw new Error("E2E_AI_BASE_URL est requis avec withAi");
  }
  const sealed = sealAiKey("e2e-mock-key");
  const model = "gpt-4o-mini";
  const provider = await pool.query<{ id: string }>(
    `INSERT INTO ai_providers
       (organization_id, label, preset, dialect, base_url, api_key_ciphertext, api_key_iv,
        api_key_tag, api_key_hint, default_model, created_by)
     VALUES ($1, 'E2E mock', 'openai', 'openai', $2, $3, $4, $5, 'e2e', $6, $7)
     RETURNING id`,
    [organizationId, baseUrl, sealed.ciphertext, sealed.iv, sealed.tag, model, userId],
  );
  const providerId = provider.rows[0]?.id;
  if (providerId === undefined) throw new Error("Fournisseur IA E2E non créé");
  await pool.query(
    `INSERT INTO ai_provider_models
       (organization_id, provider_id, model_id, label, source, enabled, created_by)
     VALUES ($1, $2, $3, $3, 'manual', true, $4)`,
    [organizationId, providerId, model, userId],
  );
  await pool.query("UPDATE chat_links SET ai_provider_id = $2, ai_model = $3 WHERE id = $1", [
    linkId,
    providerId,
    model,
  ]);
}

type MockAi = {
  baseUrl: string;
  close: () => Promise<void>;
};

/**
 * Serveur OpenAI-compatible minimal : premier appel → `search_fiches`,
 * messages contenant « autres » → `continue_search`, puis réponse finale dès
 * qu'un résultat d'outil est présent. Déterministe, sans modèle réel.
 */
export function startMockAiServer(): Promise<MockAi> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((request, response) => {
      if (!request.url?.endsWith("/chat/completions")) {
        response.writeHead(404).end();
        return;
      }
      let raw = "";
      request.on("data", (chunk) => {
        raw += String(chunk);
      });
      request.on("end", () => {
        let body: { messages?: Array<{ role?: string; content?: string }> };
        try {
          body = JSON.parse(raw) as typeof body;
        } catch {
          response.writeHead(400).end();
          return;
        }
        const messages = body.messages ?? [];
        const last = messages[messages.length - 1];
        const toolAlreadyCalled = messages.some((message) => message.role === "tool");
        const lastUser = [...messages].reverse().find((message) => message.role === "user");
        let toolCall: { name: string; arguments: string } | null = null;
        if (!toolAlreadyCalled) {
          toolCall = (lastUser?.content ?? "").toLowerCase().includes("autres")
            ? { name: "continue_search", arguments: JSON.stringify({ limit: 10 }) }
            : {
                name: "search_fiches",
                arguments: JSON.stringify({ query: "", limit: 10 }),
              };
        }
        if (toolCall !== null && last?.role !== "tool") {
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              id: "chatcmpl-e2e",
              object: "chat.completion",
              model: "gpt-4o-mini",
              choices: [
                {
                  index: 0,
                  finish_reason: "tool_calls",
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: `call-${Date.now()}`,
                        type: "function",
                        function: { name: toolCall.name, arguments: toolCall.arguments },
                      },
                    ],
                  },
                },
              ],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
          );
          return;
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            id: "chatcmpl-e2e-final",
            object: "chat.completion",
            model: "gpt-4o-mini",
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: { role: "assistant", content: "Voici les fournisseurs demandés." },
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Port du mock IA introuvable"));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

/** Envoie un message visiteur via l'API publique (chemin réel du chat). */
export async function sendPublicMessage(
  conversationId: string,
  content: string,
): Promise<Record<string, unknown>> {
  const response = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify({ conversationId, content }),
  });
  if (!response.ok) {
    throw new Error(`Envoi E2E impossible (${response.status}) : ${await response.text()}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/** Lit l'historique public (même capability que le front visiteur). */
export async function fetchPublicMessages(
  conversationId: string,
): Promise<{ messages: Array<Record<string, unknown>> }> {
  const response = await api(`/api/chat/messages?conversationId=${conversationId}`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`Lecture E2E impossible (${response.status})`);
  }
  return (await response.json()) as { messages: Array<Record<string, unknown>> };
}
