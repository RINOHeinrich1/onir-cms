"use client";

import { useEffect, useMemo, useState } from "react";

export function usePagination<T>(
  items: readonly T[],
  pageSize: number,
  resetKey: string,
): {
  page: number;
  pageItems: T[];
  totalPages: number;
  total: number;
  setPage: (page: number) => void;
} {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // biome-ignore lint/correctness/useExhaustiveDependencies: le changement de filtre doit ramener page 1
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize],
  );

  return { page: currentPage, pageItems, totalPages, total: items.length, setPage };
}
