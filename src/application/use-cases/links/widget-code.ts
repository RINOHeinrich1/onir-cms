import type { WidgetPosition } from "@/domain/widget";
import { publicLinkBaseUrl } from "@/lib/env";

/** URL de l'iframe widget (le loader l'utilise). */
export function widgetEmbedUrl(token: string): string {
  return `${publicLinkBaseUrl()}/embed/${encodeURIComponent(token)}`;
}

/**
 * Snippet d'intégration copié par le client. Il ne contient que le token et la
 * position : le template et sa version restent portés par le lien.
 */
export function buildWidgetSnippet(token: string, position: WidgetPosition): string {
  const base = publicLinkBaseUrl().replace(/\/$/, "");
  return [
    `<script`,
    `  async`,
    `  src="${base}/widget/v2.js"`,
    `  data-onir-token="${token}"`,
    `  data-onir-position="${position}"`,
    `></script>`,
  ].join("\n");
}
