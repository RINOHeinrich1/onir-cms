export type StatisticsRange = {
  from: string | null;
  to: string | null;
};

export type StatisticsSummary = {
  prospects: number;
  conversations: number;
  activeConversations: number;
  finalisedConversations: number;
  fiches: number;
};

export type StatisticsMetric = "prospects" | "conversations" | "fiches";
export type StatisticsInterval = "day" | "week" | "month";

export type StatisticsPoint = {
  date: string;
  count: number;
};

export interface PublicStatisticsRepository {
  summary(organizationId: string, range: StatisticsRange): Promise<StatisticsSummary>;
  timeseries(
    organizationId: string,
    metric: StatisticsMetric,
    interval: StatisticsInterval,
    range: StatisticsRange,
  ): Promise<StatisticsPoint[]>;
}
