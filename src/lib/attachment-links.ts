import { appUrl } from "@/lib/env";

/**
 * Lien Markdown vers une pièce jointe, protégé par la session backoffice.
 * Aucun token public, aucune URL de stockage : la route vérifie l'organisation.
 */
export function attachmentMarkdownLink(name: string, attachmentId: string): string {
  const label = name.replace(/([\\[\]])/g, "\\$1");
  const base = appUrl().replace(/\/+$/, "");
  return `[${label}](${base}/api/chat/attachments/${attachmentId}/file)`;
}
