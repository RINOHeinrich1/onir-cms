export default function DashboardLoading() {
  return (
    <section aria-busy="true" aria-live="polite">
      <div className="skeleton skeleton-eyebrow" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
      <div className="skeleton skeleton-table" />
      <span className="sr-only">Chargement de la page…</span>
    </section>
  );
}
