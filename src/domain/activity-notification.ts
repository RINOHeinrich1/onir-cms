/** Notification d'activité affichable dans le tableau de bord. */
export type ActivityNotificationKind = "conversation" | "lead";

export type ActivityNotification = {
  /** Identifiant stable côté client (`conversation:<uuid>` / `lead:<uuid>`). */
  id: string;
  kind: ActivityNotificationKind;
  title: string;
  detail: string;
  href: string;
  createdAt: string;
  /** Postérieure au filigrane de lecture de l'utilisateur. */
  read: boolean;
};

/** Activité avant application du filigrane de lecture. */
export type ActivityNotificationItem = Omit<ActivityNotification, "read">;

export type ActivityConversationSource = {
  id: string;
  createdAt: string;
  visitorNom: string;
  visitorEmail: string;
  linkLabel: string;
};

export type ActivityLeadSource = {
  id: string;
  createdAt: string;
  templateKey: string;
  data: Record<string, unknown>;
  prospectNom: string | null;
  prospectPrenom: string | null;
};

const DETAIL_MAX_LENGTH = 140;

function truncate(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= DETAIL_MAX_LENGTH) return text;
  return `${text.slice(0, DETAIL_MAX_LENGTH - 1).trimEnd()}…`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Libellé lisible du visiteur, sans exposer un UUID. */
function visitorLabel(source: ActivityConversationSource): string {
  const nom = source.visitorNom.trim();
  if (nom !== "") return nom;
  const email = source.visitorEmail.trim();
  return email === "" ? "Visiteur anonyme" : email;
}

/** Libellé lisible d'un lead : prospect, puis premier champ métier pertinent. */
function leadLabel(source: ActivityLeadSource): string {
  const prospect = `${source.prospectNom ?? ""} ${source.prospectPrenom ?? ""}`.trim();
  const dataLabels = ["entreprise", "societe", "nom", "titre", "projet", "description"];
  let dataLabel = "";
  for (const key of dataLabels) {
    dataLabel = text(source.data[key]);
    if (dataLabel !== "") break;
  }
  if (prospect !== "" && dataLabel !== "" && prospect.toLowerCase() !== dataLabel.toLowerCase()) {
    return `${prospect} · ${dataLabel}`;
  }
  if (prospect !== "") return prospect;
  if (dataLabel !== "") return dataLabel;
  return source.templateKey;
}

export function conversationNotification(
  source: ActivityConversationSource,
): ActivityNotificationItem {
  const detail = [visitorLabel(source), source.linkLabel.trim()]
    .filter((part) => part !== "")
    .join(" · ");
  return {
    id: `conversation:${source.id}`,
    kind: "conversation",
    title: "Nouvelle conversation",
    detail: truncate(detail),
    href: `/conversations/${source.id}`,
    createdAt: source.createdAt,
  };
}

export function leadNotification(source: ActivityLeadSource): ActivityNotificationItem {
  return {
    id: `lead:${source.id}`,
    kind: "lead",
    title: "Nouveau lead",
    detail: truncate(leadLabel(source)),
    href: `/leads/${source.id}`,
    createdAt: source.createdAt,
  };
}

/** Ordre chronologique stable (les plus anciens d'abord). */
export function sortActivityNotifications<T extends { id: string; createdAt: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
  );
}
