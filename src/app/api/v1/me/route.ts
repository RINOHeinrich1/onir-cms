import { apiJson, withApiKey } from "../_lib/handler";

export const dynamic = "force-dynamic";

export const GET = withApiKey(null, async ({ requestId, principal }) => {
  return apiJson(
    {
      data: {
        organization: {
          id: principal.organizationId,
          name: principal.organizationName,
        },
        apiKey: {
          id: principal.apiKeyId,
          scopes: principal.scopes,
        },
        limits: {
          requestsPerMinute: 60,
          requestsPerHour: 1000,
        },
      },
    },
    requestId,
  );
});
