/** Port du fournisseur IA (B026) — inversion de dépendance, jamais exposé au client. */

export type AiRole = "system" | "user" | "assistant";

export type AiMessage = {
  role: AiRole;
  content: string;
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
  /** Remonte l'usage réel (ADR-0048) ; jamais exposé au client. */
  onUsage?: (usage: AiTokenUsage) => void | Promise<void>;
};

export interface AiClient {
  complete(input: AiCompletionInput): Promise<string>;
}
