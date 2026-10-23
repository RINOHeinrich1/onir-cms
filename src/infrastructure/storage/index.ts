import { mediaDir } from "@/lib/env";
import { diskMediaStorage } from "./disk-media-storage";

export { diskMediaStorage } from "./disk-media-storage";

/**
 * Instance de stockage média par défaut (disque, répertoire `MEDIA_DIR`).
 * `organizationId` est accepté pour l'injection de contexte (ADR-0025) ; la clé
 * effective reste portée par `save({ organizationId })`.
 */
export function mediaStorage(_organizationId?: string) {
  return diskMediaStorage(mediaDir());
}
