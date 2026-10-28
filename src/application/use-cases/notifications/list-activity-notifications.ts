import { type Actor, actorCan, organizationOf } from "@/application/actor";
import type { ActivityRepository } from "@/application/ports/activity-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ConversationIncidentRepository } from "@/application/ports/conversation-incident-repository";
import { resolveConversationLinkScope } from "@/application/use-cases/chat-operators/resolve-chat-scope";
import {
  type ActivityAlert,
  type ActivityNotification,
  conversationNotification,
  leadNotification,
  sortActivityNotifications,
} from "@/domain/activity-notification";

export const DEFAULT_NOTIFICATION_LIMIT = 6;
export const MAX_NOTIFICATION_LIMIT = 50;

export type ListActivityNotificationsDependencies = {
  activity: ActivityRepository;
  operatorScopes: ChatOperatorScopeRepository;
  incidents: ConversationIncidentRepository;
};

export type ActivityNotificationFeed = {
  items: ActivityNotification[];
  alerts: ActivityAlert[];
  unreadCount: number;
  alertCount: number;
  hasMore: boolean;
  /** Filigrane de lecture courant (ISO 8601). */
  lastReadAt: string;
};

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_NOTIFICATION_LIMIT;
  return Math.min(MAX_NOTIFICATION_LIMIT, Math.max(1, Math.trunc(value)));
}

/**
 * Flux de notifications du dashboard : dernières activités accessibles,
 * compteur non lu (postérieur au filigrane) et pagination par limite.
 * `lastReadAt` est initialisé à `now()` à la première consultation.
 */
export async function listActivityNotifications(
  deps: ListActivityNotificationsDependencies,
  actor: Actor,
  limit: number = DEFAULT_NOTIFICATION_LIMIT,
): Promise<ActivityNotificationFeed> {
  const now = new Date().toISOString();
  if (actor.organizationId === null) {
    return {
      items: [],
      alerts: [],
      unreadCount: 0,
      alertCount: 0,
      hasMore: false,
      lastReadAt: now,
    };
  }

  const canConversations = actorCan(actor, "conversations:list");
  const canLeads = actorCan(actor, "project:read");
  if (!canConversations && !canLeads) {
    return {
      items: [],
      alerts: [],
      unreadCount: 0,
      alertCount: 0,
      hasMore: false,
      lastReadAt: now,
    };
  }

  const organizationId = organizationOf(actor);
  const lastReadAt = await deps.activity.ensureLastReadAt(organizationId, actor.id);
  const allowedLinkIds = canConversations
    ? await resolveConversationLinkScope(deps.operatorScopes, actor)
    : [];
  const pageLimit = normalizeLimit(limit);
  const fetchLimit = pageLimit + 1;

  const canIntervene = actorCan(actor, "conversations:intervene");
  const [conversations, leads, unreadConversations, unreadLeads, incidents, alertCount] =
    await Promise.all([
      canConversations
        ? deps.activity.listLatestConversations(organizationId, allowedLinkIds, fetchLimit)
        : Promise.resolve([]),
      canLeads ? deps.activity.listLatestLeads(organizationId, fetchLimit) : Promise.resolve([]),
      canConversations
        ? deps.activity.countConversationsSince(organizationId, lastReadAt, allowedLinkIds)
        : Promise.resolve(0),
      canLeads ? deps.activity.countLeadsSince(organizationId, lastReadAt) : Promise.resolve(0),
      canIntervene ? deps.incidents.listOpen(organizationId, allowedLinkIds) : Promise.resolve([]),
      canIntervene ? deps.incidents.countOpen(organizationId, allowedLinkIds) : Promise.resolve(0),
    ]);

  const ordered = sortActivityNotifications([
    ...conversations.map(conversationNotification),
    ...leads.map(leadNotification),
  ]).reverse();
  const items = ordered.slice(0, pageLimit).map((item) => ({
    ...item,
    read: item.createdAt <= lastReadAt,
  }));

  const alerts: ActivityAlert[] = incidents.map((incident) => ({
    id: incident.id,
    kind: incident.kind,
    title: incident.title,
    detail: incident.detail,
    href:
      incident.kind === "fiche_generation_failed"
        ? `/conversations/${incident.conversationId}?panel=info&alert=${incident.id}`
        : `/conversations/${incident.conversationId}?alert=${incident.id}`,
    createdAt: incident.lastSeenAt,
    occurrences: incident.occurrences,
    severity: incident.severity,
  }));

  return {
    items,
    alerts,
    unreadCount: unreadConversations + unreadLeads,
    alertCount,
    hasMore: ordered.length > pageLimit,
    lastReadAt,
  };
}

/** Ouvre le menu : avance le filigrane au présent. */
export async function markActivityNotificationsRead(
  deps: Pick<ListActivityNotificationsDependencies, "activity">,
  actor: Actor,
): Promise<{ lastReadAt: string }> {
  if (actor.organizationId === null) return { lastReadAt: new Date().toISOString() };
  const lastReadAt = await deps.activity.markRead(organizationOf(actor), actor.id);
  return { lastReadAt };
}
