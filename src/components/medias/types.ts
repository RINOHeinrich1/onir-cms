import type { Media } from "@/domain/entities/media";

/** Média exposé au client. */
export type MediaDto = Media & { createdByLabel: string | null };
export type { TypeMedia } from "@/domain/entities/media";
