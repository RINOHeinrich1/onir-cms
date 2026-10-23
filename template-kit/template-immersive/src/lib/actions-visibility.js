// Visibilité des actions (prédicats PURS, sans DOM) — salle (bas-centre) et extérieur (haut-droite).

/** Barre d'actions de la SALLE : entré, vue salle, phase chat, assets prêts. */
export function roomActionsVisible({ ready, entered, view, phase }) {
  return Boolean(ready) && Boolean(entered) && view === "room" && phase === "chat";
}

/**
 * Actions EXTÉRIEURES (colonne EMPILÉE en haut à droite) : on est DEHORS (non entré),
 * en phase `chat`, la porte n'est pas en cours d'ouverture et le sas est terminé.
 * `formShown` = formulaire d'identité affiché → AUCUN bouton pendant le sas.
 */
export function outsideActionsVisible({ ready, entered, door, phase, animating, formShown }) {
  return Boolean(ready)
    && !entered
    && phase === "chat"
    && !animating
    && door !== "opening"
    && !formShown;
}
