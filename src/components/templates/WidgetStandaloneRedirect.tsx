"use client";

import { useEffect } from "react";

/** Une iframe widget reste dans son parent ; ouverte seule, elle bascule vers l’aperçu site. */
export function WidgetStandaloneRedirect({ token }: { token: string }) {
  useEffect(() => {
    if (window.parent === window) {
      window.location.replace(`/embed/${encodeURIComponent(token)}/preview`);
    }
  }, [token]);
  return null;
}
