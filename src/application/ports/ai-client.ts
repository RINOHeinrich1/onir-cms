/** Port du fournisseur IA (B026) — inversion de dépendance, jamais exposé au client. */

import type { AiCapabilities } from "@/domain/ai-capabilities";

export type AiRole = "system" | "user" | "assistant" | "tool";

/** Appel d'outil natif émis par le modèle (ADR-0067 §7.1). */
export type AiToolCall = {
  /** Identifiant fournisseur, restitué dans le message `tool`. */
  id: string;
  /** Nom de l'outil (allowlist côté application). */
  name: string;
  /** Arguments JSON **bruts** ; validés avant toute exécution. */
  arguments: string;
};

/** Définition d'outil au format OpenAI `function` (JSON Schema). */
export type AiToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AiMessage = {
  role: AiRole;
  content: string;
  /** Tool calling natif : identifiant de l'appel pour un message `tool`. */
  toolCallId?: string;
  /** Tool calling natif : appels émis par l'assistant. */
  toolCalls?: AiToolCall[];
};

/** Usage facturé par le fournisseur (tokens d'entrée et de sortie). */
export type AiTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiCompletionInput = {
  system: string;
  messages: AiMessage[];
  /** Plafond de tokens générés (borne la latence). Défaut : 700. */
  maxTokens?: number;
  /** Intention normalisée (ADR-0047) ; le client fournisseur la traduit. */
  reasoning?: "auto" | "enabled" | "disabled";
  /** Demande une sortie JSON structurée quand le fournisseur le supporte. */
  structured?: boolean;
  /** Outils proposés au modèle ; absent ⇒ chemin sans outil inchangé. */
  tools?: AiToolDefinition[];
  /** `auto` (défaut) ou `none` pour interdire un appel d'outil. */
  toolChoice?: "auto" | "none";
  /** Remonte l'usage réel (ADR-0048) ; jamais exposé au client. */
  onUsage?: (usage: AiTokenUsage) => void | Promise<void>;
  /** Sous-opération métier (ex. knowledge_selection) pour le journal ADR-0065. */
  usageOperation?: string;
  /** Remonte la raison d'arrêt du fournisseur (`stop`, `length`, …), si exposée. */
  onFinishReason?: (reason: string | null) => void;
};

/** Résultat d'une complétion avec outils (contenu éventuellement vide). */
export type AiToolCompletion = {
  content: string;
  toolCalls: AiToolCall[];
  finishReason: string | null;
};

export interface AiClient {
  complete(input: AiCompletionInput): Promise<string>;
  /**
   * Complétion avec tool calling natif. Optionnel : un client qui ne
   * l'implémente pas reste valide et le planner JSON prend le relais.
   */
  completeWithTools?(input: AiCompletionInput): Promise<AiToolCompletion>;
  /** Capacités déclaratives du fournisseur (tool calling, raisonnement…). */
  capabilities?: AiCapabilities | undefined;
}
