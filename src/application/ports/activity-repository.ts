import type {
  ActivityConversationSource,
  ActivityLeadSource,
} from "@/domain/activity-notification";

export type ActivityConversationRecord = ActivityConversationSource;
export type ActivityLeadRecord = ActivityLeadSource;

export interface ActivityRepository {
  /** Filigrane de lecture ; l'initialise à `now()` s'il n'existe pas. */
  ensureLastReadAt(organizationId: string, userId: string): Promise<string>;
  /** Filigrane de lecture des alertes d'incidents (null = jamais acquittées). */
  ensureAlertsReadAt(organizationId: string, userId: string): Promise<string | null>;
  /** Avance les filigranes (activité + alertes) à l'heure base et renvoie celui d'activité. */
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
