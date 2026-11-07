import { attachmentsDir, s3Config, storageDriver } from "@/lib/env";
import { diskAttachmentStorage } from "./disk-attachment-storage";
import { s3AttachmentStorage } from "./s3-object-storage";

export { diskAttachmentStorage } from "./disk-attachment-storage";
export { s3AttachmentStorage } from "./s3-object-storage";

export function attachmentStorage() {
  if (storageDriver() === "s3") {
    const config = s3Config();
    if (config === null) throw new Error("Configuration S3 incomplète");
    return s3AttachmentStorage(config);
  }
  return diskAttachmentStorage(attachmentsDir());
}
