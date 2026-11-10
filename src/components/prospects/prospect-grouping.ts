import type { Prospect } from "@/domain/entities/prospect";

export type ProspectGroup = {
  id: string;
  label: string;
  manual: boolean;
  total: number;
  withEmail: number;
  withoutEmail: number;
  lastCreatedAt: string | null;
};

type GroupableProspect = Pick<Prospect, "origine" | "lienLabel" | "email" | "createdAt">;

export const MANUAL_PROSPECT_GROUP_ID = "ajout-manuel";

function emptyGroup(id: string, label: string, manual: boolean): ProspectGroup {
  return {
    id,
    label,
    manual,
    total: 0,
    withEmail: 0,
    withoutEmail: 0,
    lastCreatedAt: null,
  };
}

function addProspectToGroup(group: ProspectGroup, prospect: GroupableProspect): void {
  group.total += 1;
  if (prospect.email.trim() === "") group.withoutEmail += 1;
  else group.withEmail += 1;
  if (group.lastCreatedAt === null || prospect.createdAt > group.lastCreatedAt) {
    group.lastCreatedAt = prospect.createdAt;
  }
}

/** Regroupe les prospects par origine : ajout manuel ou chatbot. */
export function groupProspects(prospects: readonly GroupableProspect[]): ProspectGroup[] {
  const groups = new Map<string, ProspectGroup>();
  for (const prospect of prospects) {
    const manual = prospect.origine === "saisie";
    const label = manual
      ? "Ajout manuel"
      : prospect.lienLabel === null || prospect.lienLabel.trim() === ""
        ? "Chatbot sans nom"
        : prospect.lienLabel;
    const id = manual ? MANUAL_PROSPECT_GROUP_ID : `chatbot:${label}`;
    const group = groups.get(id) ?? emptyGroup(id, label, manual);
    addProspectToGroup(group, prospect);
    groups.set(id, group);
  }

  return [...groups.values()].sort((left, right) => {
    if (left.manual !== right.manual) return left.manual ? -1 : 1;
    if (right.total !== left.total) return right.total - left.total;
    return left.label.localeCompare(right.label, "fr");
  });
}
