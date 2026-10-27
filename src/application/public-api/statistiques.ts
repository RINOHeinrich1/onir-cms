import type {
  PublicStatisticsRepository,
  StatisticsInterval,
  StatisticsMetric,
  StatisticsRange,
} from "@/application/ports/public-statistics-repository";

export async function statisticsSummaryForApi(
  deps: { statistics: PublicStatisticsRepository },
  organizationId: string,
  range: StatisticsRange,
) {
  return deps.statistics.summary(organizationId, range);
}

export async function statisticsTimeseriesForApi(
  deps: { statistics: PublicStatisticsRepository },
  organizationId: string,
  metric: StatisticsMetric,
  interval: StatisticsInterval,
  range: StatisticsRange,
) {
  return deps.statistics.timeseries(organizationId, metric, interval, range);
}
