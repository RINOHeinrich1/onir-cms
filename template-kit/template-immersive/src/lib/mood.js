// Humeur du visiteur → humeur du personnage (fonction pure).

/**
 * État du visiteur → humeur du personnage (`neutral` | `content` | `triste`).
 * Lit `msg.userState.label` (repli `state`) ; **absent ⇒ neutral** (fail-open).
 */
export function moodFromUserState(msg) {
  const us = msg && msg.userState;
  const raw = us?.label ?? us?.state ?? us?.value ?? null;
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "content" || v === "heureux" || v === "heureuse" || v === "joie" || v === "happy" || v === "positif") return "content";
  if (v === "triste" || v === "tristesse" || v === "sad" || v === "negatif" || v === "négatif") return "triste";
  return "neutral";
}
