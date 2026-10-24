import type { ChatLink, ChatLinkSources, ChatLinkType } from "@/domain/entities/chat";

export type CreateChatLinkInput = {
  /** Empreinte SHA-256 du jeton (clé de recherche, le clair n'est jamais persisté tel quel). */
  tokenHash: string;
  /** Jeton chiffré (copie stable sans rotation). */
  tokenEnc: string;
  /** Libellé lisible donné par l'équipe (vide = sans nom). */
  label: string;
  type: ChatLinkType;
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
  /** Affectation IA explicite (ADR-0029) ; absent/null = hériter. */
  aiProviderId?: string | null;
  aiModel?: string | null;
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
      expiresAt: string | null;
      sources: ChatLinkSources;
      confidentialiteId: string | null;
      userStateEnabled: boolean;
      visualTemplateId: string | null;
      visualTemplateVersion: string | null;
      visualTemplateConfig: Record<string, string>;
      visualTemplateParams: Record<string, string | number | boolean>;
      aiProviderId?: string | null;
      aiModel?: string | null;
    },
  ): Promise<ChatLink | null>;
  /** Remplace hash + chiffré (régénération) ; null si lien introuvable. */
  setLinkToken(
    organizationId: string,
    id: string,
    input: { tokenHash: string; tokenEnc: string },
  ): Promise<ChatLink | null>;
  /** Suppression définitive (conversations en cascade) ; false si introuvable. */
  delete(organizationId: string, id: string): Promise<boolean>;
}
