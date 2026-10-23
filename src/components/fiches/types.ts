import type { Fiche } from "@/domain/entities/fiche";

/** Fiche exposée au client. */
export type FicheDto = Fiche;

export type FicheDraft = {
  plateformes?: string[];
  budget?: string;
  duree?: string;
  contact?: string;
  statut?: "initier" | "reprendre";
  contraintesTechno?: string;
  lienDocSpec?: string;
};
