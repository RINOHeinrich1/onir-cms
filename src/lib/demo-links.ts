/**
 * Liens publics des deux démonstrations ONIR CMS.
 * Jetons publics (URLs partageables), créés dans le cockpit de démonstration.
 */
export type DemoExperience = {
  id: "simple" | "immersive";
  title: string;
  description: string;
  detail: string;
  tag: string;
  href: string;
};

export const DEMO_EXPERIENCES: readonly DemoExperience[] = [
  {
    id: "simple",
    title: "Expérience simplifiée",
    description: "Le chat ONIR CMS, sans template 3D.",
    detail: "Idéale pour les périphériques à puissance graphique légère.",
    tag: "Sans 3D",
    href: "https://cms.onirtech.com/l/6jz9EpfYfGyh-gwRr6JOoaTcqwc1nQgX",
  },
  {
    id: "immersive",
    title: "Expérience immersive",
    description: "Une scène 3D avec avatar et discussion guidée.",
    detail:
      "Idéale pour les périphériques avec un minimum de puissance graphique — pas pour les vieux appareils.",
    tag: "3D",
    href: "https://cms.onirtech.com/l/kp_CX9lKNdHhLOLO-h-W9Fj1G3s1xbiL",
  },
] as const;
