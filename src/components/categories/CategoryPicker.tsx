"use client";

import { useEffect, useState } from "react";
import type { CategoryContentType } from "@/application/ports/category-repository";
import type { Category } from "@/domain/entities/category";

/** Affectation multi-catégories d'un contenu (sauvegarde immédiate). */
export function CategoryPicker({
  contentType,
  contentId,
  canAssign = true,
}: {
  contentType: CategoryContentType;
  contentId: string;
  canAssign?: boolean;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [all, assigned] = await Promise.all([
          fetch("/api/categories", { cache: "no-store" }),
          fetch(`/api/categories/assignments?contentType=${contentType}&contentId=${contentId}`, {
            cache: "no-store",
          }),
        ]);
        const allJson = (await all.json()) as { categories?: Category[]; error?: string };
        const assignedJson = (await assigned.json()) as { categories?: Category[]; error?: string };
        if (!all.ok) throw new Error(allJson.error ?? "Catégories indisponibles");
        if (!assigned.ok) throw new Error(assignedJson.error ?? "Affectations indisponibles");
        if (!cancelled) {
          setCategories(allJson.categories ?? []);
          setSelected(new Set((assignedJson.categories ?? []).map((entry) => entry.id)));
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Catégories indisponibles");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contentType, contentId]);

  const toggle = async (categoryId: string): Promise<void> => {
    if (!canAssign || busy) return;
    const previous = selected;
    const next = new Set(selected);
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);
    setSelected(next);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/categories/assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType, contentId, categoryIds: [...next] }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(json.error ?? "Enregistrement impossible");
    } catch (cause) {
      setSelected(previous);
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <span>Catégories {busy ? "…" : ""}</span>
      {error !== null ? <p className="alert error">{error}</p> : null}
      <div className="category-picker">
        {categories.length === 0 ? <span className="hint">Aucune catégorie définie.</span> : null}
        {categories.map((category) => (
          <label key={category.id} className="check">
            <input
              type="checkbox"
              checked={selected.has(category.id)}
              disabled={!canAssign || busy}
              onChange={() => void toggle(category.id)}
            />
            <span className={category.actif ? "" : "hint"}>{category.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
