"use client";

import Image from "next/image";
import { useState } from "react";

const PREVIEW_PATHS = ["preview.png", "assets/preview.png"];

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
  version,
  name,
}: {
  templateId: string;
  version: string | null;
  name: string;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const source = PREVIEW_PATHS[sourceIndex];

  return (
    <div className="template-cover">
      <div className="template-cover-fallback" aria-hidden="true">
        <span>{initials(name)}</span>
      </div>
      {!failed && version !== null && source !== undefined ? (
        <Image
          src={`/api/template-assets/${templateId}/${encodeURIComponent(version)}/${source}`}
          alt={`Aperçu de ${name}`}
          fill
          unoptimized
          sizes="(max-width: 56rem) 100vw, 360px"
          onError={() => {
            if (sourceIndex < PREVIEW_PATHS.length - 1) {
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
