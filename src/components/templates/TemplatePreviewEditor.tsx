"use client";

import { type ComponentProps, useCallback, useEffect, useState } from "react";
import { TemplateHost } from "./TemplateHost";

type TemplateHostProps = ComponentProps<typeof TemplateHost>;

/**
 * Pont entre le studio et l’aperçu (ADR-0105).
 * Le wrapper vit dans l’iframe d’aperçu et utilise `window.top` pour joindre le
 * studio, y compris lorsque le template est rendu dans une iframe imbriquée.
 */
export function TemplatePreviewEditor({
  previewToken,
  previewStorageKey,
  ...hostProps
}: Omit<
  TemplateHostProps,
  "editorActive" | "selectedRegion" | "onRegionHover" | "onRegionSelect"
> & {
  previewToken: string | null;
  previewStorageKey?: string;
}) {
  const [editorActive, setEditorActive] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const post = useCallback(
    (message: Record<string, unknown>): void => {
      if (previewToken === null) return;
      window.top?.postMessage({ __onirEditor: 1, token: previewToken, ...message }, "*");
    },
    [previewToken],
  );

  useEffect(() => {
    if (previewToken === null) return;
    post({ type: "ready" });

    const onMessage = (event: MessageEvent): void => {
      if (event.source !== window.top) return;
      const data = event.data as Record<string, unknown> | null;
      if (data === null || typeof data !== "object" || data.__onirEditor !== 1) return;
      if (data.token !== previewToken) return;

      if (data.type === "set-active") {
        const active = data.active === true;
        setEditorActive(active);
        if (!active) setSelectedRegion(null);
      } else if (data.type === "highlight") {
        setSelectedRegion(
          typeof data.regionId === "string" && data.regionId !== "" ? data.regionId : null,
        );
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post, previewToken]);

  const onRegionHover = useCallback(
    (regionId: string | null): void => {
      post({ type: "hover", regionId });
    },
    [post],
  );

  const onRegionSelect = useCallback(
    (regionId: string): void => {
      setSelectedRegion(regionId);
      post({ type: "select", regionId });
    },
    [post],
  );

  return (
    <TemplateHost
      {...hostProps}
      editorActive={editorActive}
      onRegionHover={onRegionHover}
      onRegionSelect={onRegionSelect}
      selectedRegion={selectedRegion}
      {...(previewStorageKey === undefined ? {} : { previewStorageKey })}
    />
  );
}
