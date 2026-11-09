export type VersionedTemplate = {
  version: string;
  createdAt?: string;
};

function numericVersion(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i.exec(version.trim());
  if (match === null) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Compare deux versions (semver d'abord, ordre lexical en secours). */
export function compareTemplateVersions(a: VersionedTemplate, b: VersionedTemplate): number {
  const left = numericVersion(a.version);
  const right = numericVersion(b.version);
  if (left !== null && right !== null) {
    for (let index = 0; index < 3; index += 1) {
      const delta = (left[index] ?? 0) - (right[index] ?? 0);
      if (delta !== 0) return delta;
    }
  } else if (left !== null) {
    return 1;
  } else if (right !== null) {
    return -1;
  } else {
    const lexical = a.version.localeCompare(b.version, undefined, { numeric: true });
    if (lexical !== 0) return lexical;
  }
  const created = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  return created;
}

/** Retourne la version la plus récente selon semver, puis createdAt. */
export function latestTemplateVersion<T extends VersionedTemplate>(
  versions: readonly T[],
): T | null {
  let latest: T | null = null;
  for (const version of versions) {
    if (latest === null || compareTemplateVersions(version, latest) > 0) latest = version;
  }
  return latest;
}
