"use client";

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  label = "Pagination",
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label={label}>
      <span className="pagination-count">
        {total} résultat{total > 1 ? "s" : ""}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="btn ghost small"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Précédent
        </button>
        <span className="pagination-page" aria-current="page">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn ghost small"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Suivant
        </button>
      </div>
    </nav>
  );
}
