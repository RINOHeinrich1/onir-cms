"use client";

import { useRouter } from "next/navigation";

export function TemplateVersionSelect({
  templateId,
  versions,
  selectedVersion,
  contrat,
  source,
}: {
  templateId: string;
  versions: string[];
  selectedVersion: string;
  contrat?: string;
  source?: string;
}) {
  const router = useRouter();

  return (
    <label className="template-version-select">
      Version
      <select
        value={selectedVersion}
        onChange={(event) => {
          const params = new URLSearchParams({ version: event.target.value });
          if (contrat !== undefined) params.set("contrat", contrat);
          if (source !== undefined) params.set("source", source);
          router.push(`/templates-visuels/${templateId}/donnees?${params.toString()}`);
        }}
      >
        {versions.map((version) => (
          <option key={version} value={version}>
            {version}
          </option>
        ))}
      </select>
    </label>
  );
}
