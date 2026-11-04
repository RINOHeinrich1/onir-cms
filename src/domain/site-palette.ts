/** Palette heuristique extraite d’un site, utilisée comme contexte par l’IA. */
export type SitePaletteContext = "background" | "text" | "actions" | "surfaces" | "other";

export type SiteColorCandidate = {
  hex: string;
  usageRate: number;
  contexts: SitePaletteContext[];
};

export type SitePalette = {
  candidates: SiteColorCandidate[];
  confidence: "high" | "medium" | "low" | "none";
};

export const EMPTY_SITE_PALETTE: SitePalette = {
  candidates: [],
  confidence: "none",
};
