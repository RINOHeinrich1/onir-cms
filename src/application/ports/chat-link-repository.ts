import type {
  ActiveLinkIdentificationMode,
  ChatLink,
  ChatLinkChannels,
  ChatLinkQuota,
  ChatLinkSources,
  ChatLinkSurface,
  ChatLinkType,
  TokenResetMode,
} from "@/domain/entities/chat";

export type CreateChatLinkInput = {
  /** Empreinte SHA-256 du jeton (clé de recherche, le clair n'est jamais persisté tel quel). */
  tokenHash: string;
  /** Jeton chiffré (copie stable sans rotation). */
  tokenEnc: string;
  /** Libellé lisible donné par l'équipe (vide = sans nom). */
  label: string;
  type: ChatLinkType;
  surface: ChatLinkSurface;
  identificationMode: ActiveLinkIdentificationMode;
  prospectId: string | null;
  createdBy: string | null;
  expiresAt: string | null;
  /** Modèle figé à la création (snapshot key+version, défaut `fiche-projet`). */
  templateKey: string;
  templateVersion: number;
  /** Sources recherchées à la génération (connaissances / photothèque / liens). */
  sources: ChatLinkSources;
  /** Politique de confidentialité rattachée (optionnelle). */
  confidentialiteId: string | null;
  /** Détecter l'état du visiteur (capacité cœur, ADR-0020). */
  userStateEnabled: boolean;
  /** Template visuel rattaché (optionnel, version figée) + tokens de thème. */
  visualTemplateId: string | null;
  visualTemplateVersion: string | null;
  visualTemplateConfig: Record<string, string>;
  /** Variables du template visuel valorisées par lien (ADR-0023). */
  visualTemplateParams: Record<string, string | number | boolean>;
  widgetConfig: Record<string, unknown>;
  /** Canaux page/widget (ADR-0041) ; absent = dérivé des champs legacy. */
  channels?: ChatLinkChannels;
  /** Affectation IA explicite (ADR-0029) ; absent/null = hériter. */
  aiProviderId?: string | null;
  aiModel?: string | null;
  /** Quotas (ADR-0048) ; absent = aucun quota. */
  maxFiches?: number | null;
  maxTokens?: number | null;
  tokenResetMode?: TokenResetMode;
  tokenResetDays?: number | null;
};

export type AiTokenUsageInput = {
  conversationId: string | null;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export interface ChatLinkRepository {
  findById(organizationId: string, id: string): Promise<ChatLink | null>;
  /** Résolution publique : le token porte l'organisation (jamais le client). */
  findByTokenHash(tokenHash: string): Promise<ChatLink | null>;
  list(organizationId: string): Promise<ChatLink[]>;
  /** Incrémente le compteur d'ouvertures publiques du lien. */
  recordVisit(organizationId: string, id: string): Promise<void>;
  create(organizationId: string, input: CreateChatLinkInput): Promise<ChatLink>;
  /** Chiffré du jeton (copie stable) ; null si jamais renseigné (ligne legacy). */
  getTokenEnc(organizationId: string, id: string): Promise<string | null>;
  /** Édition globale (libellé, expiration, sources) ; null si lien introuvable. */
  updateDetails(
    organizationId: string,
    id: string,
    patch: {
      label: string;
      surface?: ChatLinkSurface;
      identificationMode?: ActiveLinkIdentificationMode;
      expiresAt: string | null;
      sources: ChatLinkSources;
      confidentialiteId?: string | null;
      userStateEnabled: boolean;
      visualTemplateId?: string | null;
      visualTemplateVersion?: string | null;
      visualTemplateConfig?: Record<string, string>;
      visualTemplateParams?: Record<string, string | number | boolean>;
      widgetConfig?: Record<string, unknown>;
      channels?: ChatLinkChannels;
      aiProviderId?: string | null;
      aiModel?: string | null;
      maxFiches?: number | null;
      maxTokens?: number | null;
      tokenResetMode?: TokenResetMode;
      tokenResetDays?: number | null;
    },
  ): Promise<ChatLink | null>;
  /** Réinitialise la consommation tokens de la période courante (ADR-0048). */
  resetTokenUsage?(organizationId: string, id: string): Promise<ChatLink | null>;
  /** Réserve atomiquement une fiche ; false si le quota est atteint. */
  reserveFiche?(organizationId: string, id: string): Promise<boolean>;
  /** Réserve atomiquement N fiches ; false si le quota ne le permet pas. */
  reserveFiches?(organizationId: string, id: string, count: number): Promise<boolean>;
  /** Rend une réservation si la création de fiche échoue. */
  releaseFiche?(organizationId: string, id: string): Promise<void>;
  /** Rend N réservations si la création de fiches échoue. */
  releaseFiches?(organizationId: string, id: string, count: number): Promise<void>;
  /** Enregistre l'usage tokens d'un appel IA et incrémente le compteur. */
  recordAiUsage?(
    organizationId: string,
    id: string,
    input: AiTokenUsageInput,
  ): Promise<ChatLinkQuota | null>;
  /** Remplace hash + chiffré (régénération) ; null si lien introuvable. */
  setLinkToken(
    organizationId: string,
    id: string,
    input: { tokenHash: string; tokenEnc: string },
  ): Promise<ChatLink | null>;
  /** Suppression définitive (conversations en cascade) ; false si introuvable. */
  delete(organizationId: string, id: string): Promise<boolean>;
}
