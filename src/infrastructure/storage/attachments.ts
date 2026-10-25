import { attachmentsDir } from "@/lib/env";
import { diskAttachmentStorage } from "./disk-attachment-storage";

export { diskAttachmentStorage } from "./disk-attachment-storage";

/** Instance de stockage privé des pièces jointes (ADR-0034). */
export function attachmentStorage() {
  return diskAttachmentStorage(attachmentsDir());
}
