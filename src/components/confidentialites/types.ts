import type { Confidentialite } from "@/domain/entities/confidentialite";

/** Politique de confidentialité exposée au client. */
export type ConfidentialiteDto = Confidentialite & { createdByLabel: string | null };
