import { mediaDir, s3Config, storageDriver } from "@/lib/env";
import { diskMediaStorage } from "./disk-media-storage";
import { s3MediaStorage } from "./s3-object-storage";

export { diskMediaStorage } from "./disk-media-storage";
export { s3MediaStorage } from "./s3-object-storage";

export function mediaStorage(_organizationId?: string) {
  if (storageDriver() === "s3") {
    const config = s3Config();
    if (config === null) throw new Error("Configuration S3 incomplète");
    return s3MediaStorage(config);
  }
  return diskMediaStorage(mediaDir());
}
