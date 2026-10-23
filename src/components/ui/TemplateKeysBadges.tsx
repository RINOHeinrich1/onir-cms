/** Affiche la portée d'un élément : « Globale » ou un badge par modèle. */
export function TemplateKeysBadges({ keys }: { keys: string[] }) {
  if (keys.length === 0) {
    return <span className="badge muted">Globale</span>;
  }
  return (
    <span className="key-chips">
      {keys.map((key) => (
        <span key={key} className="badge muted" title={key}>
          {key}
        </span>
      ))}
    </span>
  );
}
