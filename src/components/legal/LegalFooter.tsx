import { env } from "@/lib/env";

type LegalMetadata = {
  title?: string;
  fileUrl?: string;
};

/**
 * Footer légal des builds commerciaux. Ne fait aucun appel en mode open source.
 * Le document est lu à l'exécution : une nouvelle CGU ne nécessite pas de rebuild.
 */
export async function LegalFooter({ className = "" }: { className?: string }) {
  if (env("BILLING_ENABLED") !== "true") return null;

  const baseUrl = env("COMMERCIAL_BACK_URL");
  if (baseUrl === undefined) return null;

  let legal: LegalMetadata | null = null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/public/legal/terms?locale=fr`, {
      next: { revalidate: 300 },
    });
    if (response.ok) legal = (await response.json()) as LegalMetadata;
  } catch {
    legal = null;
  }

  if (legal?.fileUrl === undefined) return null;

  return (
    <footer className={`legal-footer ${className}`.trim()}>
      <span>© {new Date().getFullYear()} ONIRTECH</span>
      <span aria-hidden="true">·</span>
      <a href={legal.fileUrl} target="_blank" rel="noopener noreferrer">
        {legal.title ?? "Conditions Générales"}
      </a>
    </footer>
  );
}
