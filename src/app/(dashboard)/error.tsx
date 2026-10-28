"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="empty-state" role="alert">
      <strong>Cette page n’a pas pu être chargée.</strong>
      <span>Le problème peut être temporaire. Vous pouvez réessayer.</span>
      <button type="button" className="btn small" onClick={reset}>
        Réessayer
      </button>
    </section>
  );
}
