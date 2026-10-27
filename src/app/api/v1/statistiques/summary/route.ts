import { statisticsSummaryForApi } from "@/application/public-api/statistiques";
import { statisticsDeps } from "../../_lib/deps";
import { apiJson, withApiKey } from "../../_lib/handler";
import { parseDate } from "../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("statistiques:read", async ({ request, requestId, principal }) => {
  const params = new URL(request.url).searchParams;
  const data = await statisticsSummaryForApi(statisticsDeps(), principal.organizationId, {
    from: parseDate(params, "from"),
    to: parseDate(params, "to"),
  });
  return apiJson({ data }, requestId);
});
