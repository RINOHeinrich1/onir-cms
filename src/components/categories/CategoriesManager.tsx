"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreatorFilter } from "@/components/ui/CreatorFilter";
import {
  creatorOptions,
  hasUnassignedCreator,
  matchesCreator,
} from "@/components/ui/creator-options";
import { Modal } from "@/components/ui/Modal";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { CategoryForm } from "./CategoryForm";
import type { CategoryListItem } from "./types";

/** Administration de la taxonomie de l'organisation (ADR-0027). */
export function CategoriesManager({
  initialCategories,
  canWrite,
}: {
  initialCategories: CategoryListItem[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [editing, setEditing] = useState<CategoryListItem | null | "new">(null);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [creatorFilter, setCreatorFilter] = useState<string[]>([]);
  const creators = creatorOptions(categories);
  const showUnassigned = hasUnassignedCreator(categories);
  const visibleCategories = categories.filter((category) =>
    matchesCreator(category, creatorFilter),
  );

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch("/api/categories", { cache: "no-store" });
      if (response.ok) {
        const json = (await response.json()) as { categories: CategoryListItem[] };
        setCategories(json.categories);
      }
    } catch {
      setError("Impossible de recharger les catégories");
    }
    router.refresh();
  };

  const remove = async (category: CategoryListItem): Promise<void> => {
    if (!window.confirm(`Supprimer la catégorie « ${category.label} » ?`)) return;
    setError(null);
    try {
      const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Suppression impossible");
        return;
      }
      await refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  return (
    <div>
      {error !== null ? <p className="alert error">{error}</p> : null}
      <CreatorFilter
        options={creators}
        showUnassigned={showUnassigned}
        value={creatorFilter}
        onChange={setCreatorFilter}
      />
      {canWrite ? (
        <div className="tools" style={{ marginBottom: "0.75rem" }}>
          <button className="btn" type="button" onClick={() => setEditing("new")}>
            Nouvelle catégorie
          </button>
        </div>
      ) : null}
      <div className="table-scroll">
        <table className="table table-cards">
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Slug</th>
              <th>Position</th>
              <th>État</th>
              <th>Créé par</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleCategories.map((category) => (
              <tr key={category.id}>
                <td data-label="Libellé">{category.label}</td>
                <td data-label="Slug">
                  <code>{category.slug}</code>
                </td>
                <td data-label="Position">{category.position}</td>
                <td data-label="État">
                  <span className={`badge ${category.actif ? "" : "muted"}`}>
                    {category.actif ? "active" : "inactive"}
                  </span>
                </td>
                <td data-label="Créé par">
                  {category.createdByLabel ?? <span className="muted-text">—</span>}
                </td>
                <td data-label="Actions" className="cell-actions">
                  {canWrite ? (
                    <div className="tools">
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => setEditing(category)}
                      >
                        Modifier
                      </button>
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => void remove(category)}
                      >
                        Supprimer
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
            {visibleCategories.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  {categories.length === 0
                    ? "Aucune catégorie."
                    : "Aucune catégorie pour ce créateur."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Les catégories servent à classer médias, connaissances et liens. Supprimer une catégorie
        retire ses associations, sans supprimer les contenus.
      </p>

      {editing !== null ? (
        <Modal
          title={editing === "new" ? "Nouvelle catégorie" : `Modifier « ${editing.label} »`}
          onClose={() => setEditing(null)}
        >
          <CategoryForm
            category={editing === "new" ? null : editing}
            onSaved={() => {
              setEditing(null);
              void refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      ) : null}
    </div>
  );
}
