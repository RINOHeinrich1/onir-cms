import Image from "next/image";

/**
 * Logo de marque ONIR CMS : variante claire en thème clair, variante sombre
 * (`onir-cms-dark.webp`) en thème sombre. Bascule en CSS pur via `[data-theme]`,
 * sans JavaScript.
 */
export function BrandLogo({ priority = false }: { priority?: boolean }) {
  return (
    <>
      <Image
        src="/logo/onir-cms-light.webp"
        alt="ONIR CMS"
        width={600}
        height={177}
        priority={priority}
        className="logo-light"
      />
      <Image
        src="/logo/onir-cms-dark.webp"
        alt=""
        aria-hidden
        width={600}
        height={177}
        className="logo-dark"
      />
    </>
  );
}
