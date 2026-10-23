import type { Pool } from "pg";

export type TemplateSchemaColumn = {
  name: string;
  type: string;
  description: string;
};

export type TemplateSchemaView = {
  name: string;
  description: string;
  columns: TemplateSchemaColumn[];
};

type CatalogRow = {
  view_name: string;
  view_description: string | null;
  column_name: string;
  data_type: string;
  column_description: string | null;
};

/**
 * Catalogue des vues exposées aux templates (`template_read`).
 * Uniquement des métadonnées : aucune donnée métier, aucun accès tenant.
 * `organization_id` est masqué (filtrage interne, non utile au rédacteur).
 */
export async function listTemplateReadViews(pool: Pool): Promise<TemplateSchemaView[]> {
  const result = await pool.query<CatalogRow>(`
    SELECT c.relname AS view_name,
           obj_description(c.oid, 'pg_class') AS view_description,
           a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS data_type,
           col_description(c.oid, a.attnum) AS column_description
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = 'template_read'
       AND c.relkind IN ('v', 'm')
       AND a.attname <> 'organization_id'
     ORDER BY c.relname, a.attnum
  `);
  const views = new Map<string, TemplateSchemaView>();
  for (const row of result.rows) {
    let view = views.get(row.view_name);
    if (view === undefined) {
      view = { name: row.view_name, description: row.view_description ?? "", columns: [] };
      views.set(row.view_name, view);
    }
    view.columns.push({
      name: row.column_name,
      type: row.data_type,
      description: row.column_description ?? "",
    });
  }
  return [...views.values()];
}
