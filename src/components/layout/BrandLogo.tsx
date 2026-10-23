import Image from "next/image";

/**
 * Logo de marque Onirtech : variante claire en thème clair, variante sombre
 * (`onirtech-dark.png`) en thème sombre. Bascule en CSS pur via `[data-theme]`,
 * sans JavaScript — même principe que le site vitrine.
 */
export function BrandLogo({ priority = false }: { priority?: boolean }) {
  return (
    <>
      <Image
        src="/logo/onirtech.png"
        alt="Onirtech"
        width={121}
        height={51}
        priority={priority}
        className="logo-light"
      />
      <Image
        src="/logo/onirtech-dark.png"
        alt=""
        aria-hidden
        width={121}
        height={51}
        className="logo-dark"
      />
    </>
  );
}
