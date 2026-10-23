/** Provisionnement du compte PostgreSQL de lecture des données (ADR-0026). */
export interface TemplateReaderProvisioner {
  /** Ouvre une connexion de test et renvoie `current_user`. */
  testConnection(connectionString: string): Promise<string>;
}
