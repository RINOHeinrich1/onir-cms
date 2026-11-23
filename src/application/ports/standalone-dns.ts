/** Résolveur DNS injectable pour la vérification des domaines standalone. */
export interface StandaloneDnsResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
}
