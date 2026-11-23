import type { StandaloneBuildStorage } from "@/application/ports/standalone-build-storage";
import { mediaDir, s3Config, storageDriver } from "@/lib/env";
import { diskMediaStorage } from "./disk-media-storage";
import { s3MediaStorage, s3StandaloneBuildStorage } from "./s3-object-storage";

export { diskMediaStorage } from "./disk-media-storage";
export { s3MediaStorage, s3StandaloneBuildStorage } from "./s3-object-storage";

export function mediaStorage(_organizationId?: string) {
  if (storageDriver() === "s3") {
    const config = s3Config();
    if (config === null) throw new Error("Configuration S3 incomplète");
    return s3MediaStorage(config);
  }
  return diskMediaStorage(mediaDir());
}

/** Le standalone exige un stockage objet : pas de disque local en production. */
export function standaloneBuildStorage(): StandaloneBuildStorage {
  if (storageDriver() !== "s3") {
    throw new Error("Le stockage standalone requiert le driver S3");
  }
  const config = s3Config();
  if (config === null) throw new Error("Configuration S3 incomplète");
  return s3StandaloneBuildStorage(config);
}
