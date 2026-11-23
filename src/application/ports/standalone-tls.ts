/** Gestionnaire de certificats TLS pour les domaines standalone. */
export type IssuedStandaloneCertificate = {
  /** Référence interne du certificat (chemin, identifiant de coffre, etc.). */
  reference: string;
  expiresAt: string;
};

export interface StandaloneTlsManager {
  issue(input: { hostname: string }): Promise<IssuedStandaloneCertificate>;
}
