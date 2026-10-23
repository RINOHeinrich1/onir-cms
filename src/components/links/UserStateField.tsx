"use client";

/**
 * Toggle « Détecter l'état du visiteur » (ADR-0020).
 * Active la capacité cœur de classification de l'état du visiteur pour ce lien.
 * Désactivé par défaut (aucun appel IA supplémentaire si non coché).
 */
export function UserStateField({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <fieldset className="field">
      <legend>État du visiteur</legend>
      <label className="check">
        <input
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
        />{" "}
        Détecter l&apos;état du visiteur
      </label>
      <span className="hint">
        Le cœur classe le message du visiteur (neutre / content / triste) pour les templates qui
        déclarent la capacité. Un appel IA supplémentaire par message (fail-open).
      </span>
    </fieldset>
  );
}
