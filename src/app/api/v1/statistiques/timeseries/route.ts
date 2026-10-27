import { ValidationError } from "@/application/errors";
import type {
  StatisticsInterval,
  StatisticsMetric,
} from "@/application/ports/public-statistics-repository";
import { statisticsTimeseriesForApi } from "@/application/public-api/statistiques";
import { statisticsDeps } from "../../_lib/deps";
import { apiJson, withApiKey } from "../../_lib/handler";
import { parseDate, queryString } from "../../_lib/query";

export const dynamic = "force-dynamic";

const METRICS: StatisticsMetric[] = ["prospects", "conversations", "fiches"];
const INTERVALS: StatisticsInterval[] = ["day", "week", "month"];

export const GET = withApiKey("statistiques:read", async ({ request, requestId, principal }) => {
  const params = new URL(request.url).searchParams;
  const metric = queryString(params, "metric") ?? "prospects";
  const interval = queryString(params, "interval") ?? "day";
  if (!METRICS.includes(metric as StatisticsMetric)) {
    throw new ValidationError("metric invalide");
  }
  if (!INTERVALS.includes(interval as StatisticsInterval)) {
    throw new ValidationError("interval invalide");
  }
  const data = await statisticsTimeseriesForApi(
    statisticsDeps(),
    principal.organizationId,
    metric as StatisticsMetric,
    interval as StatisticsInterval,
    {
      from: parseDate(params, "from"),
      to: parseDate(params, "to"),
    },
  );
  return apiJson({ data }, requestId);
});
