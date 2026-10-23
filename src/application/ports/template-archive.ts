/**
 * Port d'accès à une archive de template visuel (bundle `.onirtech-template`).
 * Isolé de l'implémentation (fflate/ZIP) et du framework : le métier ne voit
 * qu'une carte { chemin → contenu } validée.
 */

export interface TemplateArchiveReader {
  /**
   * Extrait une archive en { chemin relatif → contenu }.
   * DOIT rejeter (ValidationError) toute archive non conforme : chemin absolu,
   * `..`, antislash, symlink, nombre de fichiers ou taille totale dépassés.
   */
  extract(data: Buffer): Promise<Map<string, Buffer>>;
}

export interface TemplateHasher {
  /** SHA-256 encodé base64 (format SRI). */
  sha256Base64(data: Buffer): string;
  /** SHA-256 encodé hexadécimal. */
  sha256Hex(data: Buffer): string;
}
