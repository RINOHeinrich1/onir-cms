/** Usages IA configurables (ADR-0058). */
export const AI_USAGES = ["response", "extraction", "selection", "summary", "assistant"] as const;
export type AiUsage = (typeof AI_USAGES)[number];

export const AI_LINK_USAGES = ["response", "extraction", "selection", "summary"] as const;
export type AiLinkUsage = (typeof AI_LINK_USAGES)[number];

export const AI_USAGE_LABELS: Record<AiUsage, string> = {
  response: "Génération de réponse",
  extraction: "Extraction de données",
  selection: "Sélection médias & connaissances",
  summary: "Résumé de conversation",
  assistant: "Assistant interne",
};

export type AiModelTarget = { kind: "model"; providerId: string; model: string };
export type AiClusterTarget = { kind: "cluster"; clusterId: string };
export type AiTarget = AiModelTarget | AiClusterTarget;
export type AiLinkTarget = AiTarget | { kind: "inherit" };

export type AiUsageDefault = {
  usage: AiUsage;
  target: AiTarget;
};

export type AiClusterMember = {
  position: number;
  providerId: string;
  model: string;
  enabled: boolean;
};

export type AiCluster = {
  id: string;
  organizationId: string;
  label: string;
  description: string;
  actif: boolean;
  members: AiClusterMember[];
  createdAt: string;
  updatedAt: string;
};

export type AiLinkOverride = {
  usage: AiLinkUsage;
  target: AiLinkTarget;
};

export function isAiUsage(value: string): value is AiUsage {
  return (AI_USAGES as readonly string[]).includes(value);
}

export function isAiLinkUsage(value: string): value is AiLinkUsage {
  return (AI_LINK_USAGES as readonly string[]).includes(value);
}
