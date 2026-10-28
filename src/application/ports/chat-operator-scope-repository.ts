/** Portée d'un opérateur chat (ADR-0043). */
export type ChatOperatorScope = {
  /** true = tous les liens de l'organisation (défaut). */
  allLinks: boolean;
  /** Liens explicitement assignés quand `allLinks` est false. */
  linkIds: string[];
};

export interface ChatOperatorScopeRepository {
  /**
   * Portée effective de l'utilisateur. `null` = aucune restriction explicite,
   * donc tous les liens (défaut ADR-0043).
   */
  findForUser(organizationId: string, userId: string): Promise<ChatOperatorScope | null>;
  /** Remplace la portée. `allLinks = true` efface les assignations. */
  setForUser(
    organizationId: string,
    userId: string,
    scope: ChatOperatorScope,
  ): Promise<ChatOperatorScope>;
}
