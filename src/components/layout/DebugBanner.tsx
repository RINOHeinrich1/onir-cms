import { env } from "@/lib/env";

type RuntimeBanner = {
  enabled?: boolean;
  message?: string;
  detail?: string;
};

/**
 * Bandeau d'intervention affiché sous le header, uniquement en mode commercial.
 * Le réglage est lu à l'exécution depuis le backoffice commercial.
 */
export async function DebugBanner() {
  if (env("BILLING_ENABLED") !== "true") return null;
  const baseUrl = env("COMMERCIAL_BACK_URL");
  if (baseUrl === undefined) return null;

  let banner: RuntimeBanner | null = null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/public/runtime-banner`, {
      cache: "no-store",
    });
    if (response.ok) banner = (await response.json()) as RuntimeBanner;
  } catch {
    banner = null;
  }

  if (banner?.enabled !== true || !banner.message) return null;

  return (
    <div className="debug-banner" role="status">
      <span className="debug-banner-dot" aria-hidden="true" />
      <div>
        <p>{banner.message}</p>
        {banner.detail ? <p className="debug-banner-detail">{banner.detail}</p> : null}
      </div>
    </div>
  );
}
