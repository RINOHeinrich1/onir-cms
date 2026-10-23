/** Port du fournisseur IA (B026) — inversion de dépendance, jamais exposé au client. */

export type AiRole = "system" | "user" | "assistant";

export type AiMessage = {
  role: AiRole;
  content: string;
};

export type AiCompletionInput = {
  system: string;
  messages: AiMessage[];
  /** Plafond de tokens générés (borne la latence). Défaut : 700. */
  maxTokens?: number;
};

export interface AiClient {
  complete(input: AiCompletionInput): Promise<string>;
}
