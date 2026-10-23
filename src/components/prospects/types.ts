import type { NatureProspect, Prospect } from "@/domain/entities/prospect";

/** Prospect exposé au client (aucun secret, aucun identifiant interne sensible). */
export type ProspectDto = Prospect;
export type { NatureProspect };
