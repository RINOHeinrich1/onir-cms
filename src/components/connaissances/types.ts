import type { Connaissance } from "@/domain/entities/connaissance";

/** Entrée exposée au client. */
export type ConnaissanceDto = Connaissance & { createdByLabel: string | null };
