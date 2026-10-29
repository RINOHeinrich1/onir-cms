type JsonSchema = Record<string, unknown>;

const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });

const json = (schema: JsonSchema) => ({
  "application/json": { schema },
});

const single = (schema: JsonSchema, description: string) => ({
  description,
  content: json({
    type: "object",
    required: ["data"],
    properties: { data: schema },
  }),
});

const page = (schema: JsonSchema, description: string) => ({
  description,
  content: json({
    type: "object",
    required: ["data", "pagination"],
    properties: {
      data: { type: "array", items: schema },
      pagination: ref("Pagination"),
    },
  }),
});

const noContent = (description: string) => ({ description });

const errorResponses = {
  "400": { description: "Requête invalide", content: json(ref("Error")) },
  "401": { description: "Clé API invalide", content: json(ref("Error")) },
  "403": { description: "Scope insuffisant", content: json(ref("Error")) },
  "404": { description: "Ressource introuvable", content: json(ref("Error")) },
  "409": { description: "Conflit", content: json(ref("Error")) },
  "429": { description: "Trop de requêtes", content: json(ref("Error")) },
  "500": { description: "Erreur interne", content: json(ref("Error")) },
};

function pathId(name = "id"): JsonSchema {
  return {
    name,
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  };
}

function query(name: string, schema: JsonSchema): JsonSchema {
  return { name, in: "query", required: false, schema };
}

function operation(
  tag: string,
  operationId: string,
  scopes: string[],
  responses: JsonSchema,
  extra: JsonSchema = {},
): JsonSchema {
  return {
    tags: [tag],
    operationId,
    security: [{ bearerAuth: [] }],
    "x-required-scopes": scopes,
    "x-tenant-scoped": true,
    ...extra,
    responses: { ...responses, ...errorResponses },
  };
}

function createOperation(
  tag: string,
  operationId: string,
  scopes: string[],
  schemaName: string,
  responses: JsonSchema,
): JsonSchema {
  return operation(tag, operationId, scopes, responses, {
    requestBody: {
      required: true,
      content: json(ref(schemaName)),
    },
  });
}

const limit = query("limit", { type: "integer", minimum: 1, maximum: 100, default: 25 });
const cursor = query("cursor", { type: "string" });
const sort = query("sort", {
  type: "string",
  enum: ["createdAt:asc", "createdAt:desc"],
  default: "createdAt:desc",
});
const q = query("q", { type: "string", maxLength: 200 });
const createdFrom = query("createdFrom", { type: "string", format: "date-time" });
const createdTo = query("createdTo", { type: "string", format: "date-time" });
const updatedFrom = query("updatedFrom", { type: "string", format: "date-time" });
const updatedTo = query("updatedTo", { type: "string", format: "date-time" });

const ficheListParameters = [
  limit,
  cursor,
  sort,
  q,
  createdFrom,
  createdTo,
  updatedFrom,
  updatedTo,
  query("templateKey", { type: "string" }),
  query("templateVersion", { type: "integer", minimum: 1 }),
  query("prospectId", { type: "string", format: "uuid" }),
  query("conversationId", { type: "string", format: "uuid" }),
  query("chatbotId", { type: "string", format: "uuid" }),
  query("linkId", { type: "string", format: "uuid", deprecated: true }),
  query("includeArchived", { type: "boolean", default: false }),
];

const prospectListParameters = [
  limit,
  cursor,
  sort,
  q,
  createdFrom,
  createdTo,
  updatedFrom,
  updatedTo,
  query("origine", { type: "string", enum: ["saisie", "libre"] }),
  query("chatbotId", { type: "string", format: "uuid" }),
];

const conversationListParameters = [
  limit,
  cursor,
  sort,
  q,
  createdFrom,
  createdTo,
  query("status", {
    type: "string",
    enum: ["en_cours", "finalisees", "toutes", "archivees"],
    default: "toutes",
  }),
  query("chatbotId", { type: "string", format: "uuid" }),
  query("prospectId", { type: "string", format: "uuid" }),
];

const chatbotListParameters = [
  limit,
  cursor,
  sort,
  q,
  query("type", { type: "string", enum: ["specifique", "standard"] }),
  query("active", { type: "boolean" }),
];

const mediaListParameters = [
  limit,
  cursor,
  sort,
  q,
  query("type", { type: "string", enum: ["photo", "lien"] }),
  query("active", { type: "boolean" }),
  query("chatbotId", { type: "string", format: "uuid" }),
];

const connaissanceListParameters = [
  limit,
  cursor,
  sort,
  q,
  query("active", { type: "boolean" }),
  query("chatbotId", { type: "string", format: "uuid" }),
];

export function openapiDocument(): JsonSchema {
  return {
    openapi: "3.1.0",
    info: {
      title: "ONIR CMS API",
      version: "1.0.0-alpha.1",
      description:
        "API server-to-server ONIR CMS. Les requêtes sont isolées par l’organisation de la clé API. Utilisez Authorize avec une clé `onir_live_...`.",
    },
    servers: [{ url: "/api/v1", description: "Instance courante" }],
    tags: [
      { name: "Système" },
      { name: "Fiches" },
      { name: "Prospects" },
      { name: "Conversations" },
      { name: "Chatbots" },
      { name: "Médias" },
      { name: "Connaissances" },
      { name: "Modèles" },
      { name: "Statistiques" },
      { name: "Webhooks" },
    ],
    security: [{ bearerAuth: [] }],
    paths: {
      "/me": {
        get: operation("Système", "getMe", [], {
          "200": single(ref("Me"), "Identité de la clé API"),
        }),
      },
      "/fiches": {
        get: operation(
          "Fiches",
          "listFiches",
          ["fiches:read"],
          { "200": page(ref("Fiche"), "Liste paginée de fiches") },
          { parameters: ficheListParameters },
        ),
      },
      "/fiches/{id}": {
        get: operation(
          "Fiches",
          "getFiche",
          ["fiches:read"],
          { "200": single(ref("Fiche"), "Fiche") },
          { parameters: [pathId()] },
        ),
      },
      "/fiches/{id}/export": {
        get: operation(
          "Fiches",
          "exportFiche",
          ["fiches:read"],
          {
            "200": {
              description: "Document Markdown ou PDF",
              content: {
                "text/markdown": { schema: { type: "string" } },
                "application/pdf": { schema: { type: "string", format: "binary" } },
              },
            },
          },
          {
            parameters: [
              pathId(),
              query("format", {
                type: "string",
                enum: ["markdown", "md", "pdf"],
                default: "markdown",
              }),
            ],
          },
        ),
      },
      "/fiches/{id}/archive": {
        post: operation(
          "Fiches",
          "archiveFiche",
          ["fiches:write"],
          { "200": single(ref("Fiche"), "Fiche archivée") },
          { parameters: [pathId()] },
        ),
      },
      "/fiches/{id}/unarchive": {
        post: operation(
          "Fiches",
          "unarchiveFiche",
          ["fiches:write"],
          { "200": single(ref("Fiche"), "Fiche désarchivée") },
          { parameters: [pathId()] },
        ),
      },
      "/prospects": {
        get: operation(
          "Prospects",
          "listProspects",
          ["prospects:read"],
          { "200": page(ref("Prospect"), "Liste paginée de prospects") },
          { parameters: prospectListParameters },
        ),
        post: createOperation(
          "Prospects",
          "createProspect",
          ["prospects:write"],
          "ProspectCreate",
          { "201": single(ref("Prospect"), "Prospect créé") },
        ),
      },
      "/prospects/{id}": {
        get: operation(
          "Prospects",
          "getProspect",
          ["prospects:read"],
          { "200": single(ref("Prospect"), "Prospect") },
          { parameters: [pathId()] },
        ),
        patch: operation(
          "Prospects",
          "updateProspect",
          ["prospects:write"],
          { "200": single(ref("Prospect"), "Prospect modifié") },
          {
            parameters: [pathId()],
            requestBody: { required: true, content: json(ref("ProspectPatch")) },
          },
        ),
      },
      "/prospects/{id}/conversations": {
        get: operation(
          "Prospects",
          "listProspectConversations",
          ["conversations:read"],
          { "200": single({ type: "array", items: ref("ConversationSummary") }, "Conversations") },
          { parameters: [pathId()] },
        ),
      },
      "/prospects/{id}/fiches": {
        get: operation(
          "Prospects",
          "listProspectFiches",
          ["fiches:read"],
          { "200": single({ type: "array", items: ref("Fiche") }, "Fiches") },
          { parameters: [pathId()] },
        ),
      },
      "/medias": {
        get: operation(
          "Médias",
          "listMedias",
          ["medias:read"],
          { "200": page(ref("Media"), "Liste paginée de médias") },
          { parameters: mediaListParameters },
        ),
        post: operation(
          "Médias",
          "createMedia",
          ["medias:write"],
          {
            "201": single(ref("Media"), "Média créé"),
          },
          {
            requestBody: {
              required: true,
              content: {
                "application/json": { schema: ref("MediaLinkCreate") },
                "multipart/form-data": { schema: ref("MediaPhotoCreate") },
              },
            },
          },
        ),
      },
      "/medias/{id}/file": {
        get: operation(
          "Médias",
          "getMediaFile",
          ["medias:read"],
          {
            "200": {
              description: "Fichier photo",
              content: {
                "image/*": { schema: { type: "string", format: "binary" } },
              },
            },
          },
          { parameters: [pathId()] },
        ),
      },
      "/medias/{id}": {
        get: operation(
          "Médias",
          "getMedia",
          ["medias:read"],
          { "200": single(ref("Media"), "Média") },
          { parameters: [pathId()] },
        ),
        patch: operation(
          "Médias",
          "updateMedia",
          ["medias:write"],
          { "200": single(ref("Media"), "Média modifié") },
          {
            parameters: [pathId()],
            requestBody: { required: true, content: json(ref("MediaPatch")) },
          },
        ),
        delete: operation(
          "Médias",
          "deleteMedia",
          ["medias:write"],
          { "200": noContent("Média supprimé") },
          { parameters: [pathId()] },
        ),
      },
      "/connaissances": {
        get: operation(
          "Connaissances",
          "listConnaissances",
          ["connaissances:read"],
          { "200": page(ref("Connaissance"), "Liste paginée de connaissances") },
          { parameters: connaissanceListParameters },
        ),
        post: createOperation(
          "Connaissances",
          "createConnaissance",
          ["connaissances:write"],
          "ConnaissanceCreate",
          { "201": single(ref("Connaissance"), "Connaissance créée") },
        ),
      },
      "/connaissances/{id}": {
        get: operation(
          "Connaissances",
          "getConnaissance",
          ["connaissances:read"],
          { "200": single(ref("Connaissance"), "Connaissance") },
          { parameters: [pathId()] },
        ),
        patch: operation(
          "Connaissances",
          "updateConnaissance",
          ["connaissances:write"],
          { "200": single(ref("Connaissance"), "Connaissance modifiée") },
          {
            parameters: [pathId()],
            requestBody: {
              required: true,
              content: json(ref("ConnaissancePatch")),
            },
          },
        ),
        delete: operation(
          "Connaissances",
          "deleteConnaissance",
          ["connaissances:write"],
          { "200": noContent("Connaissance supprimée") },
          { parameters: [pathId()] },
        ),
      },
      "/conversations": {
        get: operation(
          "Conversations",
          "listConversations",
          ["conversations:read"],
          { "200": page(ref("ConversationSummary"), "Liste paginée de conversations") },
          { parameters: conversationListParameters },
        ),
      },
      "/conversations/{id}": {
        get: operation(
          "Conversations",
          "getConversation",
          ["conversations:read"],
          { "200": single(ref("ConversationDetail"), "Conversation et contexte") },
          { parameters: [pathId()] },
        ),
      },
      "/conversations/{id}/messages": {
        get: operation(
          "Conversations",
          "listConversationMessages",
          ["conversations:read"],
          { "200": page(ref("Message"), "Messages paginés") },
          {
            parameters: [
              pathId(),
              limit,
              cursor,
              query("sort", { type: "string", enum: ["createdAt:asc", "createdAt:desc"] }),
            ],
          },
        ),
      },
      "/conversations/{id}/fiches": {
        get: operation(
          "Conversations",
          "listConversationFiches",
          ["fiches:read"],
          { "200": single({ type: "array", items: ref("Fiche") }, "Fiches") },
          { parameters: [pathId()] },
        ),
      },
      "/conversations/{id}/close": {
        post: operation(
          "Conversations",
          "closeConversation",
          ["conversations:write"],
          {
            "200": single(
              {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  status: { type: "string", enum: ["finalisee"] },
                },
              },
              "Conversation clôturée",
            ),
          },
          { parameters: [pathId()] },
        ),
      },
      "/chatbots": {
        get: operation(
          "Chatbots",
          "listChatbots",
          ["chatbots:read"],
          { "200": page(ref("Chatbot"), "Liste paginée de chatbots") },
          { parameters: chatbotListParameters },
        ),
        post: createOperation("Chatbots", "createChatbot", ["chatbots:write"], "ChatbotCreate", {
          "201": single(ref("Chatbot"), "Chatbot créé"),
        }),
      },
      "/chatbots/{id}": {
        get: operation(
          "Chatbots",
          "getChatbot",
          ["chatbots:read"],
          { "200": single(ref("Chatbot"), "Chatbot") },
          { parameters: [pathId()] },
        ),
        patch: operation(
          "Chatbots",
          "updateChatbot",
          ["chatbots:write"],
          { "200": single(ref("Chatbot"), "Chatbot modifié") },
          {
            parameters: [pathId()],
            requestBody: { required: true, content: json(ref("ChatbotPatch")) },
          },
        ),
        delete: operation(
          "Chatbots",
          "deleteChatbot",
          ["chatbots:write"],
          { "200": noContent("Chatbot supprimé") },
          { parameters: [pathId()] },
        ),
      },
      "/modeles": {
        get: operation(
          "Modèles",
          "listModeles",
          ["modeles:read"],
          { "200": page(ref("Template"), "Liste paginée de modèles") },
          { parameters: [limit, cursor, sort, q] },
        ),
      },
      "/modeles/{key}": {
        get: operation(
          "Modèles",
          "getModele",
          ["modeles:read"],
          { "200": single(ref("TemplateDetail"), "Modèle et versions") },
          {
            parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
          },
        ),
      },
      "/modeles/{key}/versions": {
        get: operation(
          "Modèles",
          "listModeleVersions",
          ["modeles:read"],
          { "200": single({ type: "array", items: ref("TemplateVersionSummary") }, "Versions") },
          {
            parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
          },
        ),
      },
      "/modeles/{key}/versions/{version}": {
        get: operation(
          "Modèles",
          "getModeleVersion",
          ["modeles:read"],
          { "200": single(ref("TemplateVersion"), "Version du modèle") },
          {
            parameters: [
              { name: "key", in: "path", required: true, schema: { type: "string" } },
              {
                name: "version",
                in: "path",
                required: true,
                schema: { type: "integer", minimum: 1 },
              },
            ],
          },
        ),
      },
      "/statistiques/summary": {
        get: operation(
          "Statistiques",
          "getStatisticsSummary",
          ["statistiques:read"],
          { "200": single(ref("StatisticsSummary"), "Agrégats") },
          {
            parameters: [
              query("from", { type: "string", format: "date-time" }),
              query("to", { type: "string", format: "date-time" }),
            ],
          },
        ),
      },
      "/statistiques/timeseries": {
        get: operation(
          "Statistiques",
          "getStatisticsTimeseries",
          ["statistiques:read"],
          { "200": single({ type: "array", items: ref("StatisticsPoint") }, "Série temporelle") },
          {
            parameters: [
              query("metric", {
                type: "string",
                enum: ["prospects", "conversations", "fiches"],
                default: "prospects",
              }),
              query("interval", {
                type: "string",
                enum: ["day", "week", "month"],
                default: "day",
              }),
              query("from", { type: "string", format: "date-time" }),
              query("to", { type: "string", format: "date-time" }),
            ],
          },
        ),
      },
      "/webhooks": {
        get: operation(
          "Webhooks",
          "listWebhooks",
          ["webhooks:read"],
          { "200": single({ type: "array", items: ref("WebhookEndpoint") }, "Webhooks") },
          { parameters: [query("templateKey", { type: "string" })] },
        ),
        post: createOperation(
          "Webhooks",
          "createWebhook",
          ["webhooks:write"],
          "WebhookEndpointCreate",
          { "201": single(ref("WebhookEndpoint"), "Webhook créé") },
        ),
      },
      "/webhooks/{id}": {
        get: operation(
          "Webhooks",
          "getWebhook",
          ["webhooks:read"],
          { "200": single(ref("WebhookEndpoint"), "Webhook") },
          { parameters: [pathId()] },
        ),
        patch: operation(
          "Webhooks",
          "updateWebhook",
          ["webhooks:write"],
          { "200": single(ref("WebhookEndpoint"), "Webhook modifié") },
          {
            parameters: [pathId()],
            requestBody: { required: true, content: json(ref("WebhookEndpointCreate")) },
          },
        ),
        delete: operation(
          "Webhooks",
          "deleteWebhook",
          ["webhooks:write"],
          { "200": noContent("Webhook supprimé") },
          { parameters: [pathId()] },
        ),
      },
      "/webhooks/{id}/deliveries": {
        get: operation(
          "Webhooks",
          "listWebhookDeliveries",
          ["webhooks:read"],
          { "200": single({ type: "array", items: ref("WebhookDelivery") }, "Livraisons") },
          {
            parameters: [
              pathId(),
              limit,
              query("ficheId", { type: "string", format: "uuid" }),
              query("status", {
                type: "string",
                enum: ["queued", "running", "succeeded", "failed"],
              }),
            ],
          },
        ),
      },
      "/webhook-deliveries/{id}": {
        get: operation(
          "Webhooks",
          "getWebhookDelivery",
          ["webhooks:read"],
          { "200": single(ref("WebhookDelivery"), "Livraison") },
          { parameters: [pathId()] },
        ),
      },
      "/webhook-deliveries/{id}/retry": {
        post: operation(
          "Webhooks",
          "retryWebhookDelivery",
          ["webhooks:write"],
          { "202": single(ref("WebhookDelivery"), "Livraison relancée") },
          { parameters: [pathId()] },
        ),
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "onir_live_...",
          description:
            "Clé API créée dans le backoffice, onglet Clés API. Collez uniquement la partie après `Bearer`.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: { type: "array", items: { type: "object", additionalProperties: true } },
              },
            },
            requestId: { type: "string", format: "uuid" },
          },
        },
        Pagination: {
          type: "object",
          required: ["limit", "hasMore"],
          properties: {
            limit: { type: "integer" },
            hasMore: { type: "boolean" },
            nextCursor: { type: ["string", "null"] },
          },
        },
        Me: {
          type: "object",
          properties: {
            organization: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                name: { type: "string" },
              },
            },
            apiKey: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                scopes: { type: "array", items: { type: "string" } },
              },
            },
            limits: {
              type: "object",
              properties: {
                requestsPerMinute: { type: "integer" },
                requestsPerHour: { type: "integer" },
              },
            },
          },
        },
        Fiche: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            createdAt: { type: "string", format: "date-time" },
            template: {
              type: "object",
              properties: {
                key: { type: "string" },
                version: { type: "integer" },
              },
            },
            prospectId: { type: ["string", "null"], format: "uuid" },
            conversationId: { type: ["string", "null"], format: "uuid" },
            archived: { type: "boolean" },
            data: { type: "object", additionalProperties: true },
          },
        },
        Media: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            type: { type: "string", enum: ["photo", "lien"] },
            libelle: { type: "string" },
            description: { type: "string" },
            chatLinkIds: { type: "array", items: { type: "string", format: "uuid" } },
            active: { type: "boolean" },
            url: { type: ["string", "null"], format: "uri" },
            fileUrl: { type: ["string", "null"] },
            mime: { type: ["string", "null"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        MediaLinkCreate: {
          type: "object",
          required: ["libelle", "url"],
          properties: {
            type: { type: "string", enum: ["lien"], default: "lien" },
            libelle: { type: "string", maxLength: 120 },
            description: { type: "string", maxLength: 2000 },
            url: { type: "string", format: "uri" },
            chatLinkIds: { type: "array", items: { type: "string", format: "uuid" } },
            actif: { type: "boolean", default: true },
          },
        },
        MediaPhotoCreate: {
          type: "object",
          required: ["fichier", "libelle"],
          properties: {
            fichier: { type: "string", format: "binary" },
            libelle: { type: "string", maxLength: 120 },
            description: { type: "string", maxLength: 2000 },
            chatLinkIds: { type: "array", items: { type: "string", format: "uuid" } },
            actif: { type: "boolean", default: true },
          },
        },
        MediaPatch: {
          type: "object",
          properties: {
            libelle: { type: "string", maxLength: 120 },
            description: { type: "string", maxLength: 2000 },
            url: { type: "string", format: "uri" },
            chatLinkIds: { type: "array", items: { type: "string", format: "uuid" } },
            actif: { type: "boolean" },
          },
        },
        Connaissance: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            titre: { type: "string" },
            contenu: { type: "string" },
            chatLinkIds: { type: "array", items: { type: "string", format: "uuid" } },
            active: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ConnaissanceCreate: {
          type: "object",
          required: ["titre", "contenu"],
          properties: {
            titre: { type: "string", maxLength: 120 },
            contenu: { type: "string" },
            chatLinkIds: { type: "array", items: { type: "string", format: "uuid" } },
          },
        },
        ConnaissancePatch: {
          type: "object",
          properties: {
            titre: { type: "string", maxLength: 120 },
            contenu: { type: "string" },
            chatLinkIds: { type: "array", items: { type: "string", format: "uuid" } },
            actif: { type: "boolean" },
          },
        },
        Prospect: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            nom: { type: "string" },
            prenom: { type: "string" },
            nature: { type: "string", enum: ["physique", "morale"] },
            email: { type: "string", format: "email" },
            activite: { type: "string" },
            fonction: { type: "string" },
            detail: { type: "string" },
            origine: { type: "string", enum: ["saisie", "libre"] },
            chatbotId: { type: ["string", "null"], format: "uuid" },
            chatbotLabel: { type: ["string", "null"] },
            contactMissing: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ProspectCreate: {
          type: "object",
          required: ["nom", "nature", "email"],
          properties: {
            nom: { type: "string", maxLength: 200 },
            prenom: { type: "string" },
            nature: { type: "string", enum: ["physique", "morale"] },
            email: { type: "string", format: "email" },
            activite: { type: "string" },
            fonction: { type: "string" },
            detail: { type: "string" },
          },
        },
        ProspectPatch: {
          type: "object",
          properties: {
            nom: { type: "string" },
            prenom: { type: "string" },
            nature: { type: "string", enum: ["physique", "morale"] },
            email: { type: "string", format: "email" },
            activite: { type: "string" },
            fonction: { type: "string" },
            detail: { type: "string" },
          },
        },
        ConversationSummary: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            chatbotId: { type: "string", format: "uuid" },
            chatbotLabel: { type: "string" },
            chatbotType: { type: "string", enum: ["specifique", "standard"] },
            prospectId: { type: ["string", "null"], format: "uuid" },
            visitor: {
              type: "object",
              properties: {
                nom: { type: "string" },
                email: { type: "string" },
              },
            },
            status: { type: "string", enum: ["en_cours", "finalisee"] },
            messageCount: { type: "integer" },
            lastMessageAt: { type: ["string", "null"], format: "date-time" },
            archived: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Conversation: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            chatbotId: { type: "string", format: "uuid" },
            prospectId: { type: ["string", "null"], format: "uuid" },
            visitor: { type: "object", additionalProperties: true },
            status: { type: "string", enum: ["en_cours", "finalisee"] },
            lastMessageAt: { type: ["string", "null"], format: "date-time" },
            consentementAt: { type: ["string", "null"], format: "date-time" },
            confidentialiteId: { type: ["string", "null"], format: "uuid" },
            channel: { type: "string", enum: ["page", "widget"] },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        ConversationDetail: {
          type: "object",
          properties: {
            conversation: ref("Conversation"),
            messages: { type: "array", items: ref("Message") },
            chatbot: { type: ["object", "null"], additionalProperties: true },
            prospect: { type: ["object", "null"], additionalProperties: true },
            fiches: { type: "array", items: ref("Fiche") },
          },
        },
        Message: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            role: { type: "string", enum: ["user", "assistant"] },
            content: { type: "string" },
            medias: { type: "array", items: { type: "object", additionalProperties: true } },
            attachments: { type: "array", items: { type: "object", additionalProperties: true } },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Chatbot: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            label: { type: "string" },
            type: { type: "string", enum: ["specifique", "standard"] },
            active: { type: "boolean" },
            expiresAt: { type: ["string", "null"], format: "date-time" },
            prospectId: { type: ["string", "null"], format: "uuid" },
            template: {
              type: "object",
              properties: {
                key: { type: "string" },
                version: { type: "integer" },
              },
            },
            sources: { type: "object", additionalProperties: true },
            channels: { type: "object", additionalProperties: true },
            ai: { type: "object", additionalProperties: true },
            visitCount: { type: "integer" },
            lastVisitAt: { type: ["string", "null"], format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        ChatbotCreate: {
          type: "object",
          required: ["label", "type", "templateKey"],
          properties: {
            label: { type: "string", maxLength: 120 },
            type: { type: "string", enum: ["specifique", "standard"] },
            templateKey: { type: "string" },
            prospectId: { type: ["string", "null"], format: "uuid" },
            expiresAt: { type: ["string", "null"], format: "date-time" },
            sources: { type: "object", additionalProperties: true },
            channels: { type: "object", additionalProperties: true },
          },
        },
        ChatbotPatch: {
          type: "object",
          properties: {
            label: { type: "string", maxLength: 120 },
            expiresAt: { type: ["string", "null"], format: "date-time" },
            sources: { type: "object", additionalProperties: true },
            channels: { type: "object", additionalProperties: true },
            active: { type: "boolean" },
          },
        },
        Template: {
          type: "object",
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            description: { type: "string" },
            currentVersion: { type: "integer" },
            fields: { type: "array", items: { type: "object", additionalProperties: true } },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        TemplateDetail: {
          allOf: [
            ref("Template"),
            {
              type: "object",
              properties: {
                versions: { type: "array", items: ref("TemplateVersionSummary") },
              },
            },
          ],
        },
        TemplateVersionSummary: {
          type: "object",
          properties: {
            version: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
            createdBy: { type: ["string", "null"], format: "uuid" },
          },
        },
        TemplateVersion: {
          type: "object",
          properties: {
            version: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
            createdBy: { type: ["string", "null"], format: "uuid" },
            definition: { type: "object", additionalProperties: true },
          },
        },
        StatisticsSummary: {
          type: "object",
          properties: {
            prospects: { type: "integer" },
            conversations: { type: "integer" },
            activeConversations: { type: "integer" },
            finalisedConversations: { type: "integer" },
            fiches: { type: "integer" },
          },
        },
        StatisticsPoint: {
          type: "object",
          properties: {
            date: { type: "string", format: "date" },
            count: { type: "integer" },
          },
        },
        WebhookEndpoint: {
          type: "object",
          additionalProperties: true,
        },
        WebhookEndpointCreate: {
          type: "object",
          required: ["templateKey", "name", "url"],
          properties: {
            templateKey: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            enabled: { type: "boolean" },
            httpMethod: { type: "string", enum: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] },
            url: { type: "string", format: "uri" },
            bodyMode: { type: "string", enum: ["json", "form_urlencoded", "multipart", "raw"] },
            bodyTemplate: { type: "string" },
            fieldMappings: { type: "array", items: { type: "object", additionalProperties: true } },
            auth: { type: "object", additionalProperties: true },
            timeoutMs: { type: "integer" },
            maxAttempts: { type: "integer" },
            retryBackoffMs: { type: "integer" },
          },
        },
        WebhookDelivery: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  };
}
