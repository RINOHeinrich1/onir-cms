"use client";

import Image from "next/image";
import { useState } from "react";

const PREVIEW_PATHS = ["preview.png", "assets/preview.png"];

const STATIC_COVERS: Record<string, string> = {
  starter: "/template-covers/starter.webp",
  immersive: "/template-covers/immersive.webp",
  mandampro: "/template-covers/mandampro.webp",
  "parcours-immersif": "/template-covers/parcours-immersif.webp",
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function TemplateCover({
  templateId,
  templateKey,
  version,
  name,
}: {
  templateId: string;
  templateKey?: string;
  version: string | null;
  name: string;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const sources = [
    ...(version === null
      ? []
      : PREVIEW_PATHS.map(
          (path) => `/api/template-assets/${templateId}/${encodeURIComponent(version)}/${path}`,
        )),
    ...(templateKey !== undefined && STATIC_COVERS[templateKey] !== undefined
      ? [STATIC_COVERS[templateKey]]
      : []),
  ];
  const source = sources[sourceIndex];

  return (
    <div className="template-cover">
      <div className="template-cover-fallback" aria-hidden="true">
        <span>{initials(name)}</span>
      </div>
      {!failed && source !== undefined ? (
        <Image
          src={source}
          alt={`Aperçu de ${name}`}
          fill
          unoptimized
          sizes="(max-width: 56rem) 100vw, 360px"
          onError={() => {
            if (sourceIndex < sources.length - 1) {
              setSourceIndex(sourceIndex + 1);
            } else {
              setFailed(true);
            }
          }}
        />
      ) : null}
    </div>
  );
}
