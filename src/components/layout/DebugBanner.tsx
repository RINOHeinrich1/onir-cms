import Link from "next/link";
import { getRuntimeBanner } from "@/lib/runtime-banner";

/**
 * Bandeau d'intervention affiché sous le header, uniquement en mode commercial.
 * Le détail est volontairement séparé dans une page dédiée.
 */
export async function DebugBanner() {
  const banner = await getRuntimeBanner();
  if (banner === null || !banner.enabled || banner.message === "") return null;

  return (
    <div className="debug-banner" role="status">
      <span className="debug-banner-dot" aria-hidden="true" />
      <p>{banner.message}</p>
      {banner.detail ? (
        <Link className="debug-banner-detail-link" href="/debug-banner">
          Détails
        </Link>
      ) : null}
    </div>
  );
}
