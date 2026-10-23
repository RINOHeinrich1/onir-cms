/** Fichier lu depuis le stockage média. */
export type StoredFile = {
  data: Buffer;
  contentType: string;
};

/**
 * Port de stockage des fichiers photo — isolé de la base et du framework.
 * L'implémentation actuelle écrit sur disque ; un adapter objet (S3…) peut la
 * remplacer sans toucher au métier.
 */
export interface MediaStorage {
  /** Enregistre un fichier et renvoie sa clé de stockage (préfixée organisation). */
  save(input: { data: Buffer; contentType: string; organizationId?: string }): Promise<string>;
  /** Lit un fichier par sa clé ; `null` si absent ou clé invalide. */
  read(key: string): Promise<StoredFile | null>;
  /** Supprime un fichier (silencieux si absent). */
  remove(key: string): Promise<void>;
}
