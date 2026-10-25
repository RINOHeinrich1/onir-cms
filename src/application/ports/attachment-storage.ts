import type { AttachmentMime } from "@/domain/entities/attachment";

export type StoredAttachment = {
  data: Buffer;
  contentType: string;
};

export interface AttachmentStorage {
  /** Enregistre le fichier et renvoie une clé opaque (jamais le nom d'origine). */
  save(input: { data: Buffer; mime: AttachmentMime; organizationId: string }): Promise<string>;
  read(key: string): Promise<StoredAttachment | null>;
  remove(key: string): Promise<void>;
}
