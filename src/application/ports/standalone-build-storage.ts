import type { StoredFile } from "@/application/ports/media-storage";

/** Stockage objet des artefacts standalone, isolé du stockage média. */
export interface StandaloneBuildStorage {
  put(input: { key: string; data: Uint8Array; contentType: string }): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  remove(key: string): Promise<void>;
}
