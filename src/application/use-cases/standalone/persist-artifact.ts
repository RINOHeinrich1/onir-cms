import { createHash } from "node:crypto";
import type { StandaloneBuildStorage } from "@/application/ports/standalone-build-storage";
import type { StandaloneRepository } from "@/application/ports/standalone-repository";
import { standaloneBuildArtifactPrefix } from "@/domain/standalone";
import {
  type AssembledStandaloneArtifact,
  type AssembleStandaloneArtifactInput,
  assembleStandaloneArtifact,
} from "./assemble-artifact";

export type PersistStandaloneArtifactInput = AssembleStandaloneArtifactInput;

export type PersistedStandaloneArtifact = {
  artifactKey: string;
  artifactSha256: string;
  manifest: AssembledStandaloneArtifact["manifest"];
};

export type PersistStandaloneArtifactDependencies = {
  storage: StandaloneBuildStorage;
  builds: Pick<StandaloneRepository, "markBuildReady">;
};

function artifactHash(artifact: AssembledStandaloneArtifact): string {
  const hash = createHash("sha256");
  for (const file of [...artifact.files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.data);
    hash.update("\n");
  }
  return `sha256:${hash.digest("hex")}`;
}

/**
 * Assemble, écrit et marque un build comme prêt.
 * En cas d'échec partiel, les objets déjà écrits sont supprimés.
 */
export async function persistStandaloneArtifact(
  deps: PersistStandaloneArtifactDependencies,
  input: PersistStandaloneArtifactInput,
): Promise<PersistedStandaloneArtifact> {
  const artifact = assembleStandaloneArtifact(input);
  const artifactKey = standaloneBuildArtifactPrefix(input.chatLinkId, input.buildId);
  const written: string[] = [];

  try {
    for (const file of artifact.files) {
      const key = `${artifactKey}/${file.path}`;
      await deps.storage.put({
        key,
        data: file.data,
        contentType: file.contentType,
      });
      written.push(key);
    }

    const artifactSha256 = artifactHash(artifact);
    await deps.builds.markBuildReady({
      id: input.buildId,
      artifactKey,
      artifactSha256,
    });

    return {
      artifactKey,
      artifactSha256,
      manifest: artifact.manifest,
    };
  } catch (error) {
    await Promise.allSettled(written.map((key) => deps.storage.remove(key)));
    throw error;
  }
}
