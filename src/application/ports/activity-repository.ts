import type {
  ActivityConversationSource,
  ActivityLeadSource,
} from "@/domain/activity-notification";

export type ActivityConversationRecord = ActivityConversationSource;
export type ActivityLeadRecord = ActivityLeadSource;

export interface ActivityRepository {
  /** Filigrane de lecture ; l'initialise à `now()` s'il n'existe pas. */
  ensureLastReadAt(organizationId: string, userId: string): Promise<string>;
  /** Avance le filigrane à l'heure base (sans jamais le reculer) et le renvoie. */
  markRead(organizationId: string, userId: string): Promise<string>;

  /** Dernières conversations accessibles, les plus récentes d'abord. */
  listLatestConversations(
    organizationId: string,
    allowedLinkIds: string[] | null,
    limit: number,
  ): Promise<ActivityConversationRecord[]>;

  /** Derniers leads accessibles, les plus récents d'abord. */
  listLatestLeads(organizationId: string, limit: number): Promise<ActivityLeadRecord[]>;

  /** Nombre de conversations accessibles postérieures au filigrane. */
  countConversationsSince(
    organizationId: string,
    since: string,
    allowedLinkIds: string[] | null,
  ): Promise<number>;

  /** Nombre de leads accessibles postérieurs au filigrane. */
  countLeadsSince(organizationId: string, since: string): Promise<number>;
}
