"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import type { TemplateDataContract } from "@/domain/data-contracts";
import type { TemplateDataBinding } from "@/domain/template-data";
import {
  autoMapContractFields,
  FILTER_OPERATORS,
  type FilterOperator,
  generateChildQuery,
  generateTemplateQuery,
  guessForeignKey,
  orderForeignKeyColumns,
  type QueryFilter,
  scalarFieldNames,
} from "@/lib/data-query-composer";

type ParamSource = "input" | "link" | "system";

type ParamRow = { index: number; source: ParamSource; key: string };
type ChildRow = { id: string; path: string; queryText: string; foreignKey: string };

type SchemaColumn = { name: string; type: string; description: string };
type SchemaView = { name: string; description: string; columns: SchemaColumn[] };
type SchemaSample = { view: string; rows: Record<string, unknown>[]; truncated: boolean };
type ComposerFilter = QueryFilter & { id: string };
type ComposerChild = {
  path: string;
  requiredPath: boolean;
  view: string;
  foreignKey: string;
  fields: string[];
  required: string[];
  mapping: Record<string, string>;
  filters: ComposerFilter[];
  orderBy: string;
  orderDirection: "asc" | "desc";
};
type Composer = {
  view: SchemaView;
  fields: string[];
  required: string[];
  mapping: Record<string, string>;
  filters: ComposerFilter[];
  orderBy: string;
  orderDirection: "asc" | "desc";
  limit: number;
  children: ComposerChild[];
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).slice(0, 120);
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = previous[j] ?? 0;
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min((previous[j] ?? 0) + 1, (previous[j - 1] ?? 0) + 1, diagonal + cost);
      diagonal = saved;
    }
  }
  return previous[right.length] ?? 0;
}

/** Ajoute des pistes au message PostgreSQL (colonne ou vue inconnue). */
function enrichPreviewError(message: string, views: SchemaView[]): string {
  const column = /column "([^"]+)" (?:does not exist|n'existe pas)/i.exec(message);
  if (column !== null && column[1] !== undefined) {
    const unknown = column[1].toLowerCase();
    const candidates = views.flatMap((view) =>
      view.columns.map((entry) => ({
        label: `${view.name}.${entry.name}`,
        distance: editDistance(unknown, entry.name.toLowerCase()),
      })),
    );
    const closest = candidates
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 3)
      .map((entry) => entry.label);
    return `${message}\nColonnes proches : ${closest.join(", ")}`;
  }
  const relation = /relation "([^"]+)" (?:does not exist|n'existe pas)/i.exec(message);
  if (relation !== null) {
    return `${message}\nVues disponibles : ${views.map((view) => view.name).join(", ")}`;
  }
  return message;
}

function IconArrowLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function Help({ text }: { text: string }) {
  return (
    <button className="help" type="button" aria-label={text} data-tip={text}>
      ?
    </button>
  );
}

function SampleTable({ sample }: { sample: SchemaSample }) {
  const columns = Object.keys(sample.rows[0] ?? {});
  return (
    <div className="schema-sample">
      <span className="hint">
        {sample.rows.length} ligne{sample.rows.length > 1 ? "s" : ""}
        {sample.truncated ? " (tronqué)" : ""}
      </span>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.rows.map((row) => (
              <tr key={JSON.stringify(row)}>
                {columns.map((column) => (
                  <td key={column}>{cellText(row[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Draft = {
  name: string;
  queryText: string;
  rootPath: string;
  rootKey: string;
  children: ChildRow[];
  queryInputs: ParamRow[];
  cacheTtlSeconds: number;
  maxRows: number;
  enabled: boolean;
};

function firstArrayPath(contract: TemplateDataContract): string {
  const properties = contract.schema.properties ?? {};
  const found = Object.entries(properties).find(([, node]) => node.type === "array");
  return found?.[0] ?? "items";
}

/** Index des placeholders `$n` présents dans le SQL (trie, dédoublonne). */
export function placeholders(sql: string): number[] {
  const found = new Set<number>();
  for (const match of sql.matchAll(/\$(\d+)/g)) {
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > 0) found.add(value);
  }
  return [...found].sort((a, b) => a - b);
}

function parseParam(index: number, from: string): ParamRow {
  const [kind, key] = from.split(":", 2);
  if (kind === "input" || kind === "link") return { index, source: kind, key: key ?? "" };
  return { index, source: "system", key: "" };
}

function toDraft(contract: TemplateDataContract, binding: TemplateDataBinding | undefined): Draft {
  const queryText = binding?.queryText ?? "";
  const stored = (binding?.queryInputs ?? []).map((entry) => parseParam(entry.index, entry.from));
  const queryInputs = placeholders(queryText).map(
    (index) =>
      stored.find((entry) => entry.index === index) ??
      ({ index, source: "input", key: "" } as ParamRow),
  );
  return {
    name: binding?.name ?? "Défaut",
    queryText,
    rootPath: binding?.rootPath ?? firstArrayPath(contract),
    rootKey: binding?.rootKey ?? "id",
    children: (binding?.children ?? []).map((child, index) => ({
      // Identifiant déterministe : même valeur côté serveur et client (hydratation).
      id: `child-${index}-${child.path}`,
      path: child.path,
      queryText: child.queryText,
      foreignKey: child.foreignKey,
    })),
    queryInputs,
    cacheTtlSeconds: binding?.cacheTtlSeconds ?? 300,
    maxRows: binding?.maxRows ?? 200,
    enabled: binding?.enabled ?? false,
  };
}

/** Tableaux imbriqués possibles dans les éléments du tableau racine. */
export function childCandidates(contract: TemplateDataContract, rootPath: string): string[] {
  const root = contract.schema.properties?.[rootPath];
  const properties = root?.items?.properties ?? {};
  return Object.entries(properties)
    .filter(([, node]) => node.type === "array")
    .map(([key]) => key);
}

function serializeParams(draft: Draft): { index: number; from: string }[] {
  return draft.queryInputs.map((entry) => {
    if (entry.source === "system") return { index: entry.index, from: "system:locale" };
    if (entry.key === "") throw new Error(`Assigne une clé au paramètre $${entry.index}`);
    return { index: entry.index, from: `${entry.source}:${entry.key}` };
  });
}

function isBlankChild(child: ChildRow): boolean {
  return (
    child.path.trim() === "" && child.queryText.trim() === "" && child.foreignKey.trim() === ""
  );
}

function childIssue(child: ChildRow): string | null {
  if (child.path.trim() === "") {
    return `Enfant « ${child.path || "sans nom"} » : choisissez le tableau à remplir.`;
  }
  if (child.queryText.trim() === "") {
    return `Enfant « ${child.path} » : renseignez la requête.`;
  }
  if (child.foreignKey.trim() === "") {
    return `Enfant « ${child.path} » : renseignez la clé étrangère.`;
  }
  return null;
}

function payloadFor(draft: Draft): Record<string, unknown> {
  return {
    name: draft.name,
    queryText: draft.queryText,
    rootPath: draft.rootPath,
    rootKey: draft.rootKey,
    children: draft.children
      .filter((child) => !isBlankChild(child))
      .map((child) => ({
        path: child.path,
        query_text: child.queryText,
        foreign_key: child.foreignKey,
      })),
    queryInputs: serializeParams(draft),
    invalidateOn: "none",
    cacheTtlSeconds: draft.cacheTtlSeconds,
    maxRows: draft.maxRows,
    enabled: draft.enabled,
  };
}

function validateDraft(draft: Draft): void {
  if (draft.queryText.trim() === "") {
    throw new Error("Renseignez la requête SQL avant d'enregistrer");
  }
  const indexes = draft.queryInputs.map((entry) => entry.index);
  if (indexes.some((value, index) => value !== index + 1)) {
    throw new Error("Les placeholders du SQL doivent être contigus : $1, $2, …");
  }
  const childError = draft.children
    .filter((child) => !isBlankChild(child))
    .map((child) => childIssue(child))
    .find((issue) => issue !== null);
  if (childError !== undefined && childError !== null) {
    throw new Error(childError);
  }
}

export function TemplateDataBindingsEditor({
  templateId,
  version,
  contracts,
  bindings,
  canWrite,
  initialContract,
  initialSource,
  linkParams,
}: {
  templateId: string;
  version: string;
  contracts: TemplateDataContract[];
  bindings: TemplateDataBinding[];
  canWrite: boolean;
  initialContract?: string;
  initialSource?: string;
  linkParams: { key: string; label: string }[];
}) {
  const [selectedContract, setSelectedContract] = useState<string>(() => {
    const requested = contracts.find((contract) => contract.key === initialContract);
    return requested?.key ?? contracts[0]?.key ?? "";
  });
  const [bindingList, setBindingList] = useState<TemplateDataBinding[]>(bindings);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const out: Record<string, Draft> = {};
    for (const binding of bindings) {
      const contract = contracts.find((entry) => entry.key === binding.contractKey);
      if (contract !== undefined) out[binding.id] = toDraft(contract, binding);
    }
    return out;
  });
  const [newDrafts, setNewDrafts] = useState<Record<string, Draft>>(() => {
    const out: Record<string, Draft> = {};
    for (const contract of contracts) {
      if (!bindings.some((binding) => binding.contractKey === contract.key)) {
        out[contract.key] = toDraft(contract, undefined);
      }
    }
    return out;
  });
  const [editingSource, setEditingSource] = useState<Record<string, string | "new" | null>>(() => {
    const out: Record<string, string | "new" | null> = {};
    for (const contract of contracts) {
      const list = bindings.filter((binding) => binding.contractKey === contract.key);
      out[contract.key] =
        contract.key === initialContract &&
        initialSource !== undefined &&
        list.some((binding) => binding.id === initialSource)
          ? initialSource
          : null;
    }
    return out;
  });
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(contracts.map((contract) => [contract.key, "{}"])),
  );
  const [message, setMessage] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");
  const [schemaViews, setSchemaViews] = useState<SchemaView[]>([]);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schemaSearch, setSchemaSearch] = useState("");
  const [showSchema, setShowSchema] = useState(false);
  const [samples, setSamples] = useState<Record<string, SchemaSample>>({});
  const [sampleBusy, setSampleBusy] = useState<string | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [applyReport, setApplyReport] = useState<{
    rootChanged: boolean;
    children: number;
  } | null>(null);
  const [showGenerated, setShowGenerated] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<"assisted" | "sql">("assisted");
  const queryRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const response = await fetch(
      `/api/visual-templates/${templateId}/data-bindings?version=${encodeURIComponent(version)}`,
    );
    if (!response.ok) return;
    const json = (await response.json()) as { bindings?: TemplateDataBinding[] };
    if (json.bindings !== undefined) setBindingList(json.bindings);
  }, [templateId, version]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/visual-templates/${templateId}/data-bindings/schema`);
        const json = (await response.json()) as { views?: SchemaView[]; error?: string };
        if (!response.ok) throw new Error(json.error ?? "Catalogue indisponible");
        if (!cancelled) setSchemaViews(json.views ?? []);
      } catch (error) {
        if (!cancelled) {
          setSchemaError(error instanceof Error ? error.message : "Catalogue indisponible");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const foundContract = contracts.find((entry) => entry.key === selectedContract) ?? contracts[0];
  if (foundContract === undefined) return null;
  const contract: TemplateDataContract = foundContract;

  const contractBindings = bindingList
    .filter((binding) => binding.contractKey === contract.key)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  const activeCount = contractBindings.filter((entry) => entry.enabled).length;
  const visibleBindings = contractBindings.filter((entry) =>
    filter === "all" ? true : filter === "active" ? entry.enabled : !entry.enabled,
  );
  const schemaTerm = schemaSearch.trim().toLowerCase();
  const filteredViews = schemaViews.filter(
    (entry) =>
      schemaTerm === "" ||
      entry.name.toLowerCase().includes(schemaTerm) ||
      entry.description.toLowerCase().includes(schemaTerm) ||
      entry.columns.some((column) => column.name.toLowerCase().includes(schemaTerm)),
  );
  const editingId = editingSource[contract.key] ?? null;
  const view =
    editingId === "new" ||
    (editingId !== null && contractBindings.some((entry) => entry.id === editingId))
      ? editingId
      : null;
  const binding =
    view !== null && view !== "new"
      ? (contractBindings.find((entry) => entry.id === view) ?? null)
      : null;
  const draft =
    binding !== null
      ? (drafts[binding.id] ?? toDraft(contract, binding))
      : (newDrafts[contract.key] ?? toDraft(contract, undefined));
  const linked = bindingList.filter((entry) =>
    contracts.some((item) => item.key === entry.contractKey),
  ).length;
  const active = bindingList.filter((entry) => entry.enabled).length;
  const candidates = childCandidates(contract, draft.rootPath);

  const rootNode = contract.schema.properties?.[draft.rootPath];
  const itemProperties = rootNode?.items?.properties ?? {};
  const requiredFields = new Set(rootNode?.items?.required ?? []);
  const selectsAll = /\bselect\s+\*/i.test(draft.queryText);
  const composerMissing =
    composer === null
      ? []
      : composer.fields.filter(
          (field) => composer.required.includes(field) && (composer.mapping[field] ?? "") === "",
        );
  const composerSql =
    composer === null
      ? ""
      : generateTemplateQuery({
          view: composer.view.name,
          fields: composer.fields,
          mapping: composer.mapping,
          filters: composer.filters,
          orderBy: composer.orderBy,
          orderDirection: composer.orderDirection,
          limit: composer.limit,
        });
  const composerChildIssues =
    composer === null
      ? []
      : composer.children.flatMap((child) => {
          if (child.view === "") {
            return child.requiredPath ? [`${child.path} : choisissez une vue source`] : [];
          }
          if (child.foreignKey === "") {
            return [`${child.path} : choisissez la clé de rattachement`];
          }
          const missing = child.fields.filter(
            (field) => child.required.includes(field) && (child.mapping[field] ?? "") === "",
          );
          return missing.map((field) => `${child.path}.${field} : champ requis non mappé`);
        });
  const composerChildren =
    composer === null
      ? []
      : composer.children.flatMap((child) => {
          if (child.view === "" || child.foreignKey === "") return [];
          const queryText = generateChildQuery({
            view: child.view,
            foreignKey: child.foreignKey,
            fields: child.fields,
            mapping: child.mapping,
            filters: child.filters,
            orderBy: child.orderBy,
            orderDirection: child.orderDirection,
          });
          return queryText === ""
            ? []
            : [{ path: child.path, queryText, foreignKey: child.foreignKey }];
        });

  function selectContract(key: string): void {
    setSelectedContract(key);
    setComposer(null);
    setApplyReport(null);
    setShowGenerated(false);
    const current = editingSource[key];
    syncUrl(key, typeof current === "string" && current !== "new" ? current : null);
  }

  function syncUrl(contractKey: string, sourceId: string | null): void {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("version", version);
    params.set("contrat", contractKey);
    if (sourceId === null) params.delete("source");
    else params.set("source", sourceId);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  function openSource(id: string | "new"): void {
    setEditingSource((prev) => ({ ...prev, [contract.key]: id }));
    setStep(1);
    setApplyReport(null);
    setShowGenerated(false);
    setMode(id === "new" ? "assisted" : "sql");
    syncUrl(contract.key, id === "new" ? null : id);
  }

  function backToList(): void {
    setEditingSource((prev) => ({ ...prev, [contract.key]: null }));
    syncUrl(contract.key, null);
  }

  function update(patch: Partial<Draft>): void {
    setApplyReport(null);
    if (binding !== null) {
      setDrafts((prev) => ({
        ...prev,
        [binding.id]: { ...(prev[binding.id] ?? draft), ...patch },
      }));
    } else {
      setNewDrafts((prev) => ({
        ...prev,
        [contract.key]: { ...(prev[contract.key] ?? draft), ...patch },
      }));
    }
  }

  function changeSql(sql: string): void {
    const indexes = placeholders(sql);
    const queryInputs = indexes.map(
      (index) =>
        draft.queryInputs.find((entry) => entry.index === index) ??
        ({ index, source: "input", key: "" } as ParamRow),
    );
    update({ queryText: sql, queryInputs });
  }

  async function save(): Promise<void> {
    setBusy(true);
    setMessage((prev) => ({ ...prev, [contract.key]: "" }));
    try {
      validateDraft(draft);
      const response = await fetch(
        binding === null
          ? `/api/visual-templates/${templateId}/data-bindings`
          : `/api/visual-templates/${templateId}/data-bindings/${binding.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version, contractKey: contract.key, ...payloadFor(draft) }),
        },
      );
      const json = (await response.json()) as { binding?: TemplateDataBinding; error?: string };
      if (!response.ok || json.binding === undefined) {
        throw new Error(json.error ?? "Enregistrement impossible");
      }
      const saved = json.binding;
      setBindingList((prev) =>
        prev.some((entry) => entry.id === saved.id)
          ? prev.map((entry) => (entry.id === saved.id ? saved : entry))
          : [...prev, saved],
      );
      setDrafts((prev) => ({ ...prev, [saved.id]: toDraft(contract, saved) }));
      setNewDrafts((prev) => {
        const next = { ...prev };
        delete next[contract.key];
        return next;
      });
      setEditingSource((prev) => ({ ...prev, [contract.key]: saved.id }));
      syncUrl(contract.key, saved.id);
      setMessage((prev) => ({
        ...prev,
        [contract.key]: `Enregistré (${saved.isDefault ? "défaut" : "variante"} · rév. ${saved.revision}).`,
      }));
    } catch (error) {
      setMessage((prev) => ({
        ...prev,
        [contract.key]: error instanceof Error ? error.message : "Erreur",
      }));
    } finally {
      setBusy(false);
    }
  }

  async function createVariant(duplicate: boolean, sourceId?: string): Promise<void> {
    if (duplicate && sourceId === undefined) return;
    const modelName = bindingList.find((entry) => entry.id === sourceId)?.name;
    const fallbackName = duplicate ? `${modelName ?? "Source"} (copie)` : "Variante";
    const name = window.prompt("Nom de la nouvelle source", fallbackName);
    if (name === null || name.trim() === "") return;
    setBusy(true);
    try {
      const response = await fetch(`/api/visual-templates/${templateId}/data-bindings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version,
          contractKey: contract.key,
          name: name.trim(),
          ...(duplicate && sourceId !== undefined ? { duplicateFromId: sourceId } : {}),
        }),
      });
      const json = (await response.json()) as { binding?: TemplateDataBinding; error?: string };
      if (!response.ok || json.binding === undefined) {
        throw new Error(json.error ?? "Création impossible");
      }
      const created = json.binding;
      setBindingList((prev) => [...prev, created]);
      setDrafts((prev) => ({ ...prev, [created.id]: toDraft(contract, created) }));
      setEditingSource((prev) => ({ ...prev, [contract.key]: created.id }));
      openSource(created.id);
      setMessage((prev) => ({
        ...prev,
        [contract.key]: duplicate
          ? `Source « ${created.name} » créée à partir de « ${modelName ?? "la source"} ».`
          : `Variante « ${created.name} » créée — complétez puis activez.`,
      }));
    } catch (error) {
      setMessage((prev) => ({
        ...prev,
        [contract.key]: error instanceof Error ? error.message : "Erreur",
      }));
    } finally {
      setBusy(false);
    }
  }

  async function setDefaultFor(entry: TemplateDataBinding, open = false): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/visual-templates/${templateId}/data-bindings/${entry.id}/default`,
        { method: "POST" },
      );
      const json = (await response.json()) as { binding?: TemplateDataBinding; error?: string };
      if (!response.ok || json.binding === undefined) {
        throw new Error(json.error ?? "Impossible de définir le défaut");
      }
      await refresh();
      if (open) openSource(entry.id);
      setMessage((prev) => ({ ...prev, [contract.key]: "Source définie par défaut." }));
    } catch (error) {
      setMessage((prev) => ({
        ...prev,
        [contract.key]: error instanceof Error ? error.message : "Erreur",
      }));
    } finally {
      setBusy(false);
    }
  }

  function setDefault(): void {
    if (binding !== null) void setDefaultFor(binding, true);
  }

  function runFromMenu(
    event: { currentTarget: EventTarget & HTMLElement },
    action: () => void,
  ): void {
    event.currentTarget.closest("details")?.removeAttribute("open");
    action();
  }

  async function removeSource(entry: TemplateDataBinding): Promise<void> {
    const warning = entry.isDefault
      ? contractBindings.length === 1
        ? `Supprimer la dernière source « ${entry.name} » ? Ce contrat n'aura plus de source et les liens sans surcharge ne recevront plus de données.`
        : `Supprimer la source par défaut « ${entry.name} » ? Une autre source deviendra défaut.`
      : `Supprimer la source « ${entry.name} » ?`;
    if (!(await confirmDialog(warning))) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/visual-templates/${templateId}/data-bindings/${entry.id}`,
        { method: "DELETE" },
      );
      const json = (await response.json()) as { error?: string; promotedId?: string | null };
      if (!response.ok) throw new Error(json.error ?? "Suppression impossible");
      if (binding?.id === entry.id) {
        setEditingSource((prev) => ({ ...prev, [contract.key]: null }));
        syncUrl(contract.key, null);
      }
      await refresh();
      setMessage((prev) => ({
        ...prev,
        [contract.key]:
          json.promotedId !== null && json.promotedId !== undefined
            ? "Source supprimée ; une autre source est devenue défaut."
            : "Source supprimée.",
      }));
    } catch (error) {
      setMessage((prev) => ({
        ...prev,
        [contract.key]: error instanceof Error ? error.message : "Erreur",
      }));
    } finally {
      setBusy(false);
    }
  }

  function insertAtCursor(text: string): void {
    const area = queryRef.current;
    if (area === null) {
      update({ queryText: draft.queryText + text });
      return;
    }
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const next = `${draft.queryText.slice(0, start)}${text}${draft.queryText.slice(end)}`;
    update({ queryText: next });
    requestAnimationFrame(() => {
      area.focus();
      const position = start + text.length;
      area.setSelectionRange(position, position);
    });
  }

  async function applyViewExample(view: SchemaView): Promise<void> {
    const next = `SELECT * FROM ${view.name} LIMIT 50`;
    if (
      draft.queryText.trim() !== "" &&
      !(await confirmDialog("Remplacer la requête actuelle par cet exemple ?"))
    ) {
      return;
    }
    update({ queryText: next });
  }

  async function loadSample(view: SchemaView): Promise<void> {
    setSampleBusy(view.name);
    setSchemaError(null);
    try {
      const response = await fetch(
        `/api/visual-templates/${templateId}/data-bindings/schema?view=${encodeURIComponent(view.name)}`,
      );
      const json = (await response.json()) as {
        sample?: SchemaSample | null;
        error?: string;
      };
      if (!response.ok) throw new Error(json.error ?? "Échantillon indisponible");
      if (json.sample === null || json.sample === undefined) {
        throw new Error(json.error ?? "Échantillon indisponible");
      }
      setSamples((prev) => ({ ...prev, [view.name]: json.sample as SchemaSample }));
    } catch (error) {
      setSchemaError(error instanceof Error ? error.message : "Échantillon indisponible");
    } finally {
      setSampleBusy(null);
    }
  }

  function openComposer(view: SchemaView): void {
    setShowSchema(false);
    setStep(1);
    const fields = scalarFieldNames(itemProperties);
    if (fields.length === 0) return;
    const root = contract.schema.properties?.[draft.rootPath];
    const requiredRoot = new Set(root?.items?.required ?? []);
    const children = childCandidates(contract, draft.rootPath).map((path) => {
      const node = root?.items?.properties?.[path];
      return {
        path,
        requiredPath: requiredRoot.has(path),
        view: "",
        foreignKey: "",
        fields: Object.keys(node?.items?.properties ?? {}),
        required: [...(node?.items?.required ?? [])],
        mapping: {},
        filters: [],
        orderBy: "",
        orderDirection: "asc" as const,
      };
    });
    setComposer({
      view,
      fields,
      required: fields.filter((field) => requiredFields.has(field)),
      mapping: autoMapContractFields(fields, view.columns),
      filters: [],
      orderBy: "",
      orderDirection: "asc",
      limit: 50,
      children,
    });
  }

  function patchComposer(patch: Partial<Composer>): void {
    setComposer((previous) => (previous === null ? null : { ...previous, ...patch }));
  }

  function patchFilter(id: string, patch: Partial<ComposerFilter>): void {
    setComposer((previous) =>
      previous === null
        ? null
        : {
            ...previous,
            filters: previous.filters.map((filter) =>
              filter.id === id ? { ...filter, ...patch } : filter,
            ),
          },
    );
  }

  function addFilter(): void {
    setComposer((previous) => {
      if (previous === null) return null;
      const column = previous.view.columns[0]?.name ?? "";
      return {
        ...previous,
        filters: [
          ...previous.filters,
          {
            id: `filter-${Date.now()}-${previous.filters.length}`,
            column,
            operator: "=",
            value: "",
          },
        ],
      };
    });
  }

  function removeFilter(id: string): void {
    setComposer((previous) =>
      previous === null
        ? null
        : { ...previous, filters: previous.filters.filter((filter) => filter.id !== id) },
    );
  }

  function patchChild(path: string, patch: Partial<ComposerChild>): void {
    setComposer((previous) =>
      previous === null
        ? null
        : {
            ...previous,
            children: previous.children.map((child) =>
              child.path === path ? { ...child, ...patch } : child,
            ),
          },
    );
  }

  function selectChildView(path: string, viewName: string): void {
    const view = schemaViews.find((entry) => entry.name === viewName);
    setComposer((previous) =>
      previous === null
        ? null
        : {
            ...previous,
            children: previous.children.map((child) => {
              if (child.path !== path) return child;
              if (view === undefined) {
                return { ...child, view: "", foreignKey: "", mapping: {}, filters: [] };
              }
              return {
                ...child,
                view: view.name,
                foreignKey: guessForeignKey(child.path, view.columns, draft.rootPath),
                mapping: autoMapContractFields(child.fields, view.columns),
                filters: [],
              };
            }),
          },
    );
  }

  function addChildFilter(path: string): void {
    setComposer((previous) => {
      if (previous === null) return null;
      return {
        ...previous,
        children: previous.children.map((child) => {
          if (child.path !== path) return child;
          const column =
            child.view === ""
              ? ""
              : (schemaViews.find((view) => view.name === child.view)?.columns[0]?.name ?? "");
          return {
            ...child,
            filters: [
              ...child.filters,
              {
                id: `child-filter-${Date.now()}-${child.filters.length}`,
                column,
                operator: "IS NOT NULL",
                value: "",
              },
            ],
          };
        }),
      };
    });
  }

  function patchChildFilter(path: string, filterId: string, patch: Partial<ComposerFilter>): void {
    setComposer((previous) =>
      previous === null
        ? null
        : {
            ...previous,
            children: previous.children.map((child) =>
              child.path === path
                ? {
                    ...child,
                    filters: child.filters.map((filter) =>
                      filter.id === filterId ? { ...filter, ...patch } : filter,
                    ),
                  }
                : child,
            ),
          },
    );
  }

  function removeChildFilter(path: string, filterId: string): void {
    setComposer((previous) =>
      previous === null
        ? null
        : {
            ...previous,
            children: previous.children.map((child) =>
              child.path === path
                ? { ...child, filters: child.filters.filter((filter) => filter.id !== filterId) }
                : child,
            ),
          },
    );
  }

  function applyComposer(): void {
    if (
      composer === null ||
      composerSql === "" ||
      composerMissing.length > 0 ||
      composerChildIssues.length > 0
    ) {
      return;
    }
    const children = composerChildren.map((child, index) => ({
      id: `child-${index}-${child.path}`,
      ...child,
    }));
    const rootChanged = composerSql.trim() !== draft.queryText.trim();
    update({ queryText: composerSql, queryInputs: [], children });
    setApplyReport({ rootChanged, children: children.length });
    setComposer(null);
    setShowSchema(false);
    setStep(1);
    setMessage((previous) => ({
      ...previous,
      [contract.key]: `Requêtes appliquées : racine ${
        rootChanged ? "mise à jour" : "inchangée"
      } · ${children.length} collection(s) liée(s).`,
    }));
  }

  async function preview(): Promise<void> {
    try {
      validateDraft(draft);
    } catch (error) {
      setResult((prev) => ({
        ...prev,
        [contract.key]: error instanceof Error ? error.message : "Brouillon incomplet",
      }));
      return;
    }
    setBusy(true);
    try {
      let parsedInputs: unknown;
      try {
        parsedInputs =
          inputs[contract.key]?.trim() === "" ? {} : JSON.parse(inputs[contract.key] ?? "{}");
      } catch {
        throw new Error("Entrées d'aperçu : JSON invalide");
      }
      const response = await fetch(`/api/visual-templates/${templateId}/data-bindings/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version,
          contractKey: contract.key,
          draft: payloadFor(draft),
          inputs: parsedInputs,
        }),
      });
      const json = (await response.json()) as {
        status?: string;
        message?: string;
        error?: string;
        fieldErrors?: { path: string; message: string }[];
      };
      if (!response.ok) throw new Error(json.error ?? "Aperçu impossible");
      if (json.status === "error") {
        const lines = [json.message ?? "Erreur"];
        for (const field of json.fieldErrors ?? []) {
          lines.push(`• ${field.path} : ${field.message}`);
        }
        setResult((prev) => ({
          ...prev,
          [contract.key]: enrichPreviewError(lines.join("\n"), schemaViews),
        }));
      } else {
        setResult((prev) => ({ ...prev, [contract.key]: JSON.stringify(json, null, 2) }));
      }
    } catch (error) {
      setResult((prev) => ({
        ...prev,
        [contract.key]: error instanceof Error ? error.message : "Erreur",
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={view === null ? "data-split" : "data-split data-split-editor"}>
      <aside className="data-side">
        <p className="hint" style={{ margin: "0 0 0.5rem" }}>
          {contracts.length} contrat{contracts.length > 1 ? "s" : ""} · {linked} source
          {linked > 1 ? "s" : ""} · {active} active{active > 1 ? "s" : ""}
        </p>
        <div className="data-list">
          {contracts.map((entry) => {
            const sources = bindingList.filter((binding) => binding.contractKey === entry.key);
            const state = sources.some((binding) => binding.enabled)
              ? "actif"
              : sources.length > 0
                ? "inactif"
                : "non lié";
            const current = entry.key === contract.key;
            return (
              <button
                key={entry.key}
                type="button"
                className="data-item"
                aria-current={current ? "true" : undefined}
                onClick={() => selectContract(entry.key)}
              >
                <span className="data-item-title">{entry.label}</span>
                <span className="data-item-meta">
                  <code>{entry.key}</code>
                  <span className={`badge ${state === "actif" ? "" : "muted"}`}>{state}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="data-detail">
        <label className="field data-select">
          <span>Contrat</span>
          <select
            className="input"
            value={contract.key}
            onChange={(event) => selectContract(event.target.value)}
          >
            {contracts.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label} ({entry.key})
              </option>
            ))}
          </select>
        </label>

        <section className="card">
          <div className="page-head" style={{ marginBottom: "0.75rem" }}>
            <div>
              <h2 className="text-title" style={{ fontSize: "1.1rem" }}>
                {contract.label} <span className="badge muted">{contract.key}</span>
              </h2>
              <p className="hint">
                {contract.description === "" ? "Contrat de données" : contract.description} · v
                {contract.version} · {contract.loading}
              </p>
            </div>
            <span className="badge muted">
              {contract.inputs.length === 0
                ? "aucune entrée"
                : `entrées : ${contract.inputs.map((input) => input.key).join(", ")}`}
            </span>
          </div>

          {view === null ? (
            <div>
              <div className="tools" style={{ marginBottom: "0.75rem" }}>
                {contractBindings.length > 0 ? (
                  <>
                    <button
                      className="btn"
                      type="button"
                      disabled={!canWrite || busy}
                      onClick={() => void createVariant(false)}
                    >
                      Nouvelle source
                    </button>
                    {canWrite ? (
                      <details className="action-menu">
                        <summary className="btn ghost small">Partir d'une source</summary>
                        <div className="action-menu-items">
                          {contractBindings.map((entry) => (
                            <button
                              key={entry.id}
                              type="button"
                              disabled={busy}
                              onClick={(event) =>
                                runFromMenu(event, () => void createVariant(true, entry.id))
                              }
                            >
                              {entry.name}
                            </button>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </>
                ) : null}
              </div>
              {contractBindings.length > 0 ? (
                <div className="source-filter">
                  {(
                    [
                      ["all", `Tous (${contractBindings.length})`],
                      ["active", `Actifs (${activeCount})`],
                      ["inactive", `Inactifs (${contractBindings.length - activeCount})`],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              {contractBindings.length === 0 ? (
                <div className="empty-state">
                  <strong>Prêt à connecter « {contract.label} »</strong>
                  <p className="hint">
                    Choisissez une vue pour composer la requête, puis testez-la avant de l'activer.
                  </p>
                  {canWrite ? (
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => openSource("new")}
                    >
                      Créer une source
                    </button>
                  ) : null}
                </div>
              ) : visibleBindings.length === 0 ? (
                <p className="hint">Aucune source pour ce filtre.</p>
              ) : (
                <div className="source-list">
                  {visibleBindings.map((entry) => (
                    <div className="source-item" key={entry.id}>
                      <button
                        type="button"
                        className="source-item-main"
                        onClick={() => openSource(entry.id)}
                      >
                        <strong>{entry.name}</strong>
                        <span className="source-item-meta">
                          <span className="badge muted">
                            {entry.isDefault ? "Défaut" : "Variante"}
                          </span>
                          <span className={`badge ${entry.enabled ? "" : "muted"}`}>
                            {entry.enabled ? "actif" : "désactivé"}
                          </span>
                          <span className="hint">rév. {entry.revision}</span>
                        </span>
                      </button>
                      <details className="row-menu">
                        <summary
                          className="btn ghost small"
                          aria-label={`Actions pour ${entry.name}`}
                        >
                          …
                        </summary>
                        <div className="row-menu-items">
                          <button
                            type="button"
                            onClick={(event) => runFromMenu(event, () => openSource(entry.id))}
                          >
                            Modifier
                          </button>
                          {canWrite ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={(event) =>
                                  runFromMenu(event, () => void createVariant(true, entry.id))
                                }
                              >
                                Dupliquer
                              </button>
                              {!entry.isDefault ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={(event) =>
                                    runFromMenu(event, () => void setDefaultFor(entry))
                                  }
                                >
                                  Définir par défaut
                                </button>
                              ) : null}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={(event) =>
                                  runFromMenu(event, () => void removeSource(entry))
                                }
                              >
                                Supprimer
                              </button>
                            </>
                          ) : null}
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              )}
              {message[contract.key] ? <p className="hint">{message[contract.key]}</p> : null}
            </div>
          ) : (
            <>
              <div className="binding-bar">
                <button className="btn ghost small" type="button" onClick={backToList}>
                  ← Retour aux sources
                </button>
                <span className="hint" style={{ flex: 1 }}>
                  {binding === null
                    ? "Nouvelle source (défaut)"
                    : `${binding.isDefault ? "Défaut" : "Variante"} — ${binding.name} · rév. ${binding.revision}`}
                </span>
                {binding !== null ? (
                  <div className="binding-actions">
                    <details className="action-menu">
                      <summary className="btn ghost small" aria-label="Autres actions">
                        …
                      </summary>
                      <div className="action-menu-items">
                        <button
                          type="button"
                          disabled={!canWrite || busy}
                          onClick={(event) =>
                            runFromMenu(event, () => void createVariant(true, binding.id))
                          }
                        >
                          Dupliquer
                        </button>
                        <button
                          type="button"
                          disabled={!canWrite || busy}
                          onClick={(event) => runFromMenu(event, () => void createVariant(false))}
                        >
                          Nouvelle variante
                        </button>
                        {!binding.isDefault ? (
                          <button
                            type="button"
                            disabled={!canWrite || busy}
                            onClick={(event) => runFromMenu(event, setDefault)}
                          >
                            Définir par défaut
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={!canWrite || busy}
                          onClick={(event) => runFromMenu(event, () => void removeSource(binding))}
                        >
                          Supprimer
                        </button>
                      </div>
                    </details>
                  </div>
                ) : null}
              </div>

              <div className="steps">
                {(
                  [
                    [1, "Données"],
                    [2, "Réglages"],
                    [3, "Aperçu"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={step === value}
                    onClick={() => setStep(value)}
                  >
                    <span>{value}</span>
                    {label}
                  </button>
                ))}
              </div>

              {step === 1 ? (
                <>
                  <label className="field">
                    <span>Nom de la source</span>
                    <input
                      className="input"
                      value={draft.name}
                      disabled={!canWrite}
                      onChange={(event) => update({ name: event.target.value })}
                    />
                  </label>

                  <div className="mode-toggle">
                    <button
                      type="button"
                      aria-pressed={mode === "assisted"}
                      onClick={() => setMode("assisted")}
                    >
                      Assisté
                    </button>
                    <button
                      type="button"
                      aria-pressed={mode === "sql"}
                      onClick={() => setMode("sql")}
                    >
                      SQL
                    </button>
                  </div>

                  <div className="field">
                    <div className="field-head">
                      <span>
                        {mode === "sql" ? "Requête SQL (racine)" : "Données de la source"}
                      </span>
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => setShowSchema((previous) => !previous)}
                      >
                        {showSchema ? "Masquer les données disponibles" : "Données disponibles"}
                      </button>
                    </div>
                    {showSchema ? (
                      <>
                        <div
                          className="drawer-backdrop"
                          aria-hidden="true"
                          onClick={() => setShowSchema(false)}
                        />
                        <aside
                          className="drawer"
                          role="dialog"
                          aria-modal="true"
                          aria-label="Données disponibles"
                        >
                          <div className="drawer-head">
                            <strong>Données disponibles</strong>
                            <button
                              className="btn ghost small"
                              type="button"
                              onClick={() => setShowSchema(false)}
                            >
                              Fermer
                            </button>
                          </div>
                          <div className="schema-panel drawer-body">
                            <p className="hint" style={{ margin: 0 }}>
                              Cliquez une colonne pour l'insérer à la position du curseur.
                            </p>
                            {schemaError ? <p className="form-error">{schemaError}</p> : null}
                            <input
                              className="input"
                              placeholder="Rechercher une vue ou une colonne…"
                              value={schemaSearch}
                              onChange={(event) => setSchemaSearch(event.target.value)}
                            />
                            {filteredViews.length === 0 ? (
                              <p className="hint">Aucune vue ne correspond à la recherche.</p>
                            ) : (
                              filteredViews.map((schemaView) => {
                                const sample = samples[schemaView.name];
                                return (
                                  <details className="schema-view" key={schemaView.name}>
                                    <summary>
                                      <code>{schemaView.name}</code>
                                      {schemaView.description ? (
                                        <span className="hint">{schemaView.description}</span>
                                      ) : null}
                                    </summary>
                                    <div className="schema-actions">
                                      <button
                                        className="btn ghost small"
                                        type="button"
                                        onClick={() => void applyViewExample(schemaView)}
                                      >
                                        Requête d'exemple
                                      </button>
                                      {Object.keys(itemProperties).length > 0 ? (
                                        <button
                                          className="btn ghost small"
                                          type="button"
                                          onClick={() => openComposer(schemaView)}
                                        >
                                          Composer pour ce contrat
                                        </button>
                                      ) : null}
                                      <button
                                        className="btn ghost small"
                                        type="button"
                                        disabled={sampleBusy === schemaView.name}
                                        onClick={() => void loadSample(schemaView)}
                                      >
                                        {sampleBusy === schemaView.name
                                          ? "Chargement…"
                                          : "Voir des lignes"}
                                      </button>
                                    </div>
                                    <div className="schema-columns">
                                      {schemaView.columns.map((column) => (
                                        <button
                                          key={column.name}
                                          type="button"
                                          className="schema-column"
                                          title={column.description || column.name}
                                          onClick={() => insertAtCursor(column.name)}
                                        >
                                          <code>{column.name}</code>
                                          <span className="hint">{column.type}</span>
                                          {column.description ? (
                                            <span className="schema-column-desc">
                                              {column.description}
                                            </span>
                                          ) : null}
                                        </button>
                                      ))}
                                    </div>
                                    {sample ? <SampleTable sample={sample} /> : null}
                                  </details>
                                );
                              })
                            )}
                          </div>
                        </aside>
                      </>
                    ) : null}
                    {mode === "assisted" ? (
                      <div className="view-grid">
                        {schemaViews.map((schemaView) => (
                          <button
                            key={schemaView.name}
                            type="button"
                            className="view-card"
                            onClick={() => openComposer(schemaView)}
                          >
                            <strong>{schemaView.name}</strong>
                            <span className="hint">{schemaView.description}</span>
                            <span className="hint">{schemaView.columns.length} colonnes</span>
                          </button>
                        ))}
                        {schemaViews.length === 0 ? (
                          <p className="hint">Chargement des vues…</p>
                        ) : null}
                      </div>
                    ) : null}
                    {mode === "sql" ? (
                      <>
                        <textarea
                          ref={queryRef}
                          className="input mono"
                          rows={4}
                          value={draft.queryText}
                          disabled={!canWrite}
                          onChange={(event) => changeSql(event.target.value)}
                          placeholder="SELECT id, titre AS title FROM template_read.v_connaissances WHERE actif"
                        />
                        <span className="hint">
                          Vues autorisées : <code>template_read.*</code>
                        </span>
                      </>
                    ) : draft.queryText.trim() !== "" ? (
                      <details className="query-summary">
                        <summary>Requête actuelle</summary>
                        <pre className="composer-sql">{draft.queryText}</pre>
                      </details>
                    ) : (
                      <p className="hint">Choisissez une vue pour composer la requête.</p>
                    )}
                  </div>

                  {Object.keys(itemProperties).length > 0 ? (
                    <div className="contract-fields">
                      <span className="hint">
                        Champs attendus pour <code>{draft.rootPath}</code> · {contract.label} :
                      </span>
                      <div className="contract-field-list">
                        {Object.entries(itemProperties).map(([field, node]) => {
                          const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                          const aliased = new RegExp(`\\bAS\\s+"?${escaped}"?\\b`, "i").test(
                            draft.queryText,
                          );
                          const present = selectsAll || aliased;
                          const required = requiredFields.has(field);
                          return (
                            <span
                              key={field}
                              className={`badge ${present ? "" : "muted"}`}
                              title={`${node.type}${required ? " · requis" : ""}`}
                            >
                              {present ? "✓" : "○"} {field}
                              {required ? " *" : ""}
                            </span>
                          );
                        })}
                      </div>
                      <span className="hint">✓ présent · ○ à vérifier · * requis</span>
                    </div>
                  ) : null}
                  {applyReport !== null ? (
                    <div className="apply-report">
                      <div>
                        <strong>Requêtes appliquées</strong>
                        <p className="hint" style={{ margin: 0 }}>
                          Racine {applyReport.rootChanged ? "mise à jour" : "inchangée"} ·{" "}
                          {applyReport.children} collection(s) liée(s).
                        </p>
                      </div>
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => setShowGenerated(true)}
                      >
                        Voir les requêtes
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <details className="advanced-settings">
                    <summary>Réglages avancés</summary>
                    <div className="grid-2">
                      <label className="field">
                        <span>
                          Chemin racine{" "}
                          <Help text="Nom du tableau du contrat qui contient la liste principale (ex. books). Déduit automatiquement du contrat." />
                        </span>
                        <input
                          className="input"
                          value={draft.rootPath}
                          disabled={!canWrite}
                          onChange={(event) => update({ rootPath: event.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>
                          Clé racine{" "}
                          <Help text="Colonne qui identifie chaque élément de la liste principale (ex. id). Sert aussi à rattacher les collections liées." />
                        </span>
                        <input
                          className="input"
                          value={draft.rootKey}
                          disabled={!canWrite}
                          onChange={(event) => update({ rootKey: event.target.value })}
                        />
                      </label>
                    </div>

                    <div style={{ marginTop: "1rem" }}>
                      <h3
                        className="text-title"
                        style={{ fontSize: "0.95rem", margin: "0 0 0.25rem" }}
                      >
                        Paramètres de la requête
                      </h3>
                      <p className="hint" style={{ marginTop: 0 }}>
                        Un <code>$1</code>, <code>$2</code>… dans le SQL = une ligne. Choisissez
                        d'où vient chaque valeur.
                      </p>
                      {draft.queryInputs.length === 0 ? (
                        <p className="hint">
                          Cette requête n'utilise aucun placeholder (<code>$n</code>).
                        </p>
                      ) : (
                        draft.queryInputs.map((entry) => (
                          <div className="param-row" key={entry.index}>
                            <code>${entry.index}</code>
                            <select
                              className="input"
                              value={entry.source}
                              disabled={!canWrite}
                              onChange={(event) => {
                                const source = event.target.value as ParamSource;
                                update({
                                  queryInputs: draft.queryInputs.map((row) =>
                                    row.index === entry.index ? { ...row, source, key: "" } : row,
                                  ),
                                });
                              }}
                            >
                              <option value="input">Entrée du template</option>
                              <option value="link">Paramètre du lien</option>
                              <option value="system">Locale système</option>
                            </select>
                            {entry.source === "input" ? (
                              <select
                                className="input"
                                value={entry.key}
                                disabled={!canWrite || contract.inputs.length === 0}
                                onChange={(event) =>
                                  update({
                                    queryInputs: draft.queryInputs.map((row) =>
                                      row.index === entry.index
                                        ? { ...row, key: event.target.value }
                                        : row,
                                    ),
                                  })
                                }
                              >
                                <option value="">
                                  {contract.inputs.length === 0
                                    ? "aucune entrée déclarée"
                                    : "— choisir —"}
                                </option>
                                {contract.inputs.map((input) => (
                                  <option key={input.key} value={input.key}>
                                    {input.key}
                                  </option>
                                ))}
                              </select>
                            ) : entry.source === "link" ? (
                              <select
                                className="input"
                                value={entry.key}
                                disabled={!canWrite || linkParams.length === 0}
                                onChange={(event) =>
                                  update({
                                    queryInputs: draft.queryInputs.map((row) =>
                                      row.index === entry.index
                                        ? { ...row, key: event.target.value }
                                        : row,
                                    ),
                                  })
                                }
                              >
                                <option value="">
                                  {linkParams.length === 0
                                    ? "aucun paramètre de lien"
                                    : "— choisir —"}
                                </option>
                                {linkParams.map((param) => (
                                  <option key={param.key} value={param.key}>
                                    {param.label} ({param.key})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="hint">valeur : fr</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    <div style={{ marginTop: "1rem" }}>
                      <h3
                        className="text-title"
                        style={{ fontSize: "0.95rem", margin: "0 0 0.25rem" }}
                      >
                        Collections imbriquées
                      </h3>
                      {candidates.length === 0 ? (
                        <p className="hint">
                          Ce contrat ne contient pas de tableau imbriqué : aucun enfant n'est
                          nécessaire.
                        </p>
                      ) : (
                        <>
                          <p className="hint" style={{ marginTop: 0 }}>
                            Pour chaque élément racine, une seconde requête reçoit les identifiants
                            parents en <code>$1</code> et remplit le tableau choisi.
                          </p>
                          {draft.children.map((child, index) => {
                            const issue = isBlankChild(child) ? null : childIssue(child);
                            return (
                              <div className="child-row" key={child.id}>
                                <div className="grid-2">
                                  <label className="field">
                                    <span>Tableau à remplir</span>
                                    <select
                                      className="input"
                                      value={child.path}
                                      disabled={!canWrite}
                                      onChange={(event) =>
                                        update({
                                          children: draft.children.map((row, rowIndex) =>
                                            rowIndex === index
                                              ? { ...row, path: event.target.value }
                                              : row,
                                          ),
                                        })
                                      }
                                    >
                                      <option value="">— choisir —</option>
                                      {child.path !== "" && !candidates.includes(child.path) ? (
                                        <option value={child.path}>{child.path}</option>
                                      ) : null}
                                      {candidates.map((candidate) => (
                                        <option key={candidate} value={candidate}>
                                          {candidate}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="field">
                                    <span>
                                      Clé étrangère{" "}
                                      <Help text="Colonne de la requête enfant qui contient l'identifiant du parent (ex. book_id). Elle sert au regroupement et n'est pas exposée au contrat." />
                                    </span>
                                    <input
                                      className="input mono"
                                      value={child.foreignKey}
                                      disabled={!canWrite}
                                      onChange={(event) =>
                                        update({
                                          children: draft.children.map((row, rowIndex) =>
                                            rowIndex === index
                                              ? { ...row, foreignKey: event.target.value }
                                              : row,
                                          ),
                                        })
                                      }
                                      placeholder="book_id"
                                    />
                                  </label>
                                </div>
                                <label className="field">
                                  <span>
                                    Requête enfant{" "}
                                    <Help text="Requête exécutée avec $1 = tableau des identifiants parents. Elle doit renvoyer la clé étrangère et les champs de la collection liée." />
                                  </span>
                                  <textarea
                                    className="input mono"
                                    rows={3}
                                    value={child.queryText}
                                    disabled={!canWrite}
                                    onChange={(event) =>
                                      update({
                                        children: draft.children.map((row, rowIndex) =>
                                          rowIndex === index
                                            ? { ...row, queryText: event.target.value }
                                            : row,
                                        ),
                                      })
                                    }
                                    placeholder="SELECT book_id, index, text FROM template_read.v_pages WHERE book_id = ANY($1)"
                                  />
                                </label>
                                {issue !== null ? <p className="form-error">{issue}</p> : null}
                                {canWrite ? (
                                  <button
                                    className="btn ghost small"
                                    type="button"
                                    onClick={() =>
                                      update({
                                        children: draft.children.filter(
                                          (_, rowIndex) => rowIndex !== index,
                                        ),
                                      })
                                    }
                                  >
                                    Supprimer cet enfant
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                          {canWrite && draft.children.length < 3 ? (
                            <button
                              className="btn ghost small"
                              type="button"
                              onClick={() =>
                                update({
                                  children: [
                                    ...draft.children,
                                    {
                                      id: crypto.randomUUID(),
                                      path: candidates[0] ?? "",
                                      queryText: "",
                                      foreignKey: "",
                                    },
                                  ],
                                })
                              }
                            >
                              Ajouter un enfant
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>

                    <div className="grid-2" style={{ marginTop: "1rem" }}>
                      <label className="field">
                        <span>
                          TTL cache{" "}
                          <Help text="Durée de mise en cache du résultat, en secondes. 0 désactive le cache. Le cache est vidé à chaque enregistrement." />
                        </span>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={3600}
                          value={draft.cacheTtlSeconds}
                          disabled={!canWrite}
                          onChange={(event) =>
                            update({ cacheTtlSeconds: Number(event.target.value) })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>
                          Lignes max{" "}
                          <Help text="Nombre maximum de lignes renvoyées pour cette source. Plafonné à 1000 par le fournisseur." />
                        </span>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={1000}
                          value={draft.maxRows}
                          disabled={!canWrite}
                          onChange={(event) => update({ maxRows: Number(event.target.value) })}
                        />
                      </label>
                    </div>

                    <details style={{ marginTop: "0.75rem" }}>
                      <summary className="hint">Contrat attendu (JSON Schema)</summary>
                      <pre className="mono" style={{ overflow: "auto", maxHeight: 260 }}>
                        {JSON.stringify(contract.schema, null, 2)}
                      </pre>
                    </details>
                  </details>

                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      disabled={!canWrite}
                      onChange={(event) => update({ enabled: event.target.checked })}
                    />
                    <span>
                      Activer cette source pour les liens{" "}
                      <Help text="Une source inactive n'est jamais utilisée par les liens, même si elle est définie par défaut." />
                    </span>
                  </label>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <label className="field">
                    <span>
                      Entrées d'aperçu{" "}
                      <Help text="Valeurs des entrées déclarées par le contrat, au format JSON, utilisées uniquement pour tester la requête." />
                    </span>
                    <input
                      className="input mono"
                      value={inputs[contract.key] ?? "{}"}
                      onChange={(event) =>
                        setInputs((prev) => ({ ...prev, [contract.key]: event.target.value }))
                      }
                    />
                  </label>
                  <p className="hint">
                    L'aperçu exécute la requête et valide le contrat sans enregistrer.
                  </p>
                  {result[contract.key] ? (
                    <pre className="mono" style={{ overflow: "auto", maxHeight: 320 }}>
                      {result[contract.key]}
                    </pre>
                  ) : null}
                </>
              ) : null}

              {showGenerated ? (
                <>
                  <div
                    className="drawer-backdrop"
                    aria-hidden="true"
                    onClick={() => setShowGenerated(false)}
                  />
                  <aside
                    className="drawer"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Requêtes générées"
                  >
                    <div className="drawer-head">
                      <strong>Requêtes générées</strong>
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => setShowGenerated(false)}
                      >
                        Fermer
                      </button>
                    </div>
                    <div className="drawer-body">
                      <div className="composer-section">
                        <strong>Requête racine</strong>
                        <span className="hint">Exécutée en premier.</span>
                        <pre className="composer-sql">{draft.queryText || "—"}</pre>
                      </div>
                      {draft.children.length > 0 ? (
                        draft.children.map((child) => (
                          <div className="composer-section" key={child.id}>
                            <strong>Requête enfant « {child.path} »</strong>
                            <span className="hint">
                              Clé de rattachement : {child.foreignKey || "à définir"}
                            </span>
                            <pre className="composer-sql">{child.queryText || "—"}</pre>
                          </div>
                        ))
                      ) : (
                        <p className="hint">Aucune collection liée.</p>
                      )}
                    </div>
                  </aside>
                </>
              ) : null}

              {composer !== null ? (
                <>
                  <div
                    className="drawer-backdrop"
                    aria-hidden="true"
                    onClick={() => setComposer(null)}
                  />
                  <aside
                    className="drawer"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Composer la requête"
                  >
                    <div className="drawer-head">
                      <strong>Composer pour {contract.label}</strong>
                      <button
                        className="btn ghost small"
                        type="button"
                        onClick={() => setComposer(null)}
                      >
                        Fermer
                      </button>
                    </div>
                    <div className="drawer-body">
                      <div className="composer">
                        <div className="field-head">
                          <strong>Composer pour {contract.label}</strong>
                          <button
                            className="btn ghost small"
                            type="button"
                            onClick={() => setComposer(null)}
                          >
                            Fermer
                          </button>
                        </div>
                        <p className="hint" style={{ margin: 0 }}>
                          Choisissez la colonne de chaque champ du contrat. Les champs non mappés
                          sont ignorés ; les champs requis doivent être mappés.
                        </p>
                        <div className="composer-section">
                          <div className="field-head">
                            <strong>Requête racine</strong>
                            <span className="badge muted">{composer.view.name}</span>
                          </div>
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Champ du contrat</th>
                                <th>Colonne source</th>
                                <th>Alias SQL</th>
                              </tr>
                            </thead>
                            <tbody>
                              {composer.fields.map((field) => {
                                const column = composer.mapping[field] ?? "";
                                const required = composer.required.includes(field);
                                return (
                                  <tr key={field}>
                                    <td>
                                      <code>{field}</code>
                                      {required ? " *" : ""}
                                    </td>
                                    <td>
                                      <select
                                        className="input"
                                        value={column}
                                        onChange={(event) =>
                                          patchComposer({
                                            mapping: {
                                              ...composer.mapping,
                                              [field]: event.target.value,
                                            },
                                          })
                                        }
                                      >
                                        <option value="">— ignorer —</option>
                                        {composer.view.columns.map((entry) => (
                                          <option key={entry.name} value={entry.name}>
                                            {entry.name}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td>
                                      <code>
                                        {column === ""
                                          ? "—"
                                          : column === field
                                            ? column
                                            : `${column} AS ${field}`}
                                      </code>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {composerMissing.length > 0 ? (
                            <p className="form-error">
                              Champs requis non mappés : {composerMissing.join(", ")}
                            </p>
                          ) : null}
                          <div className="composer-section">
                            <div className="field-head">
                              <strong>Filtres</strong>
                              <button className="btn ghost small" type="button" onClick={addFilter}>
                                + Filtre
                              </button>
                            </div>
                            {composer.filters.length === 0 ? (
                              <p className="hint" style={{ margin: 0 }}>
                                Aucun filtre.
                              </p>
                            ) : (
                              composer.filters.map((filter) => (
                                <div className="composer-row" key={filter.id}>
                                  <select
                                    className="input"
                                    value={filter.column}
                                    onChange={(event) =>
                                      patchFilter(filter.id, {
                                        column: event.target.value,
                                      })
                                    }
                                  >
                                    {composer.view.columns.map((entry) => (
                                      <option key={entry.name} value={entry.name}>
                                        {entry.name}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    className="input"
                                    value={filter.operator}
                                    onChange={(event) =>
                                      patchFilter(filter.id, {
                                        operator: event.target.value as FilterOperator,
                                      })
                                    }
                                  >
                                    {FILTER_OPERATORS.map((operator) => (
                                      <option key={operator} value={operator}>
                                        {operator}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    className="input"
                                    placeholder="valeur"
                                    value={filter.value}
                                    disabled={
                                      filter.operator === "IS NULL" ||
                                      filter.operator === "IS NOT NULL"
                                    }
                                    onChange={(event) =>
                                      patchFilter(filter.id, {
                                        value: event.target.value,
                                      })
                                    }
                                  />
                                  <button
                                    className="btn ghost small"
                                    type="button"
                                    onClick={() => removeFilter(filter.id)}
                                  >
                                    Retirer
                                  </button>
                                </div>
                              ))
                            )}
                            <span className="hint">
                              Pour <code>ILIKE</code>, utilisez des jokers : <code>%mot%</code>.
                            </span>
                          </div>
                          <div className="composer-row">
                            <label className="field">
                              <span>Tri</span>
                              <select
                                className="input"
                                value={composer.orderBy}
                                onChange={(event) => patchComposer({ orderBy: event.target.value })}
                              >
                                <option value="">Aucun</option>
                                {composer.view.columns.map((entry) => (
                                  <option key={entry.name} value={entry.name}>
                                    {entry.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field">
                              <span>Sens</span>
                              <select
                                className="input"
                                value={composer.orderDirection}
                                onChange={(event) =>
                                  patchComposer({
                                    orderDirection: event.target.value === "desc" ? "desc" : "asc",
                                  })
                                }
                              >
                                <option value="asc">Croissant</option>
                                <option value="desc">Décroissant</option>
                              </select>
                            </label>
                            <label className="field">
                              <span>Limite</span>
                              <input
                                className="input"
                                type="number"
                                min={1}
                                max={1000}
                                value={composer.limit}
                                onChange={(event) =>
                                  patchComposer({ limit: Number(event.target.value) })
                                }
                              />
                            </label>
                          </div>
                          <span className="hint">Requête racine — exécutée en premier.</span>
                          <pre className="composer-sql">{composerSql || "—"}</pre>
                        </div>

                        {composer.children.length > 0 ? (
                          <div className="composer-section">
                            <strong>Collections liées</strong>
                            <p className="hint" style={{ margin: 0 }}>
                              Chaque collection est une requête séparée, exécutée après la racine.
                              La clé de rattachement contient l'identifiant du parent.
                            </p>
                            {composer.children.map((child) => {
                              const childView = schemaViews.find(
                                (entry) => entry.name === child.view,
                              );
                              const childSql = composerChildren.find(
                                (entry) => entry.path === child.path,
                              )?.queryText;
                              return (
                                <div className="composer-child" key={child.path}>
                                  <div className="field-head">
                                    <strong>
                                      <code>{child.path}</code>
                                    </strong>
                                    {child.requiredPath ? (
                                      <span className="badge muted">requis</span>
                                    ) : null}
                                  </div>
                                  <div className="composer-row">
                                    <label className="field">
                                      <span>Vue source</span>
                                      <select
                                        className="input"
                                        value={child.view}
                                        onChange={(event) =>
                                          selectChildView(child.path, event.target.value)
                                        }
                                      >
                                        <option value="">— non configurée —</option>
                                        {schemaViews.map((entry) => (
                                          <option key={entry.name} value={entry.name}>
                                            {entry.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className="field">
                                      <span>Clé de rattachement</span>
                                      <select
                                        className="input"
                                        value={child.foreignKey}
                                        disabled={childView === undefined}
                                        onChange={(event) =>
                                          patchChild(child.path, {
                                            foreignKey: event.target.value,
                                          })
                                        }
                                      >
                                        <option value="">— choisir —</option>
                                        {orderForeignKeyColumns(
                                          childView?.columns ?? [],
                                          child.path,
                                          draft.rootPath,
                                        ).map((entry) => (
                                          <option key={entry.name} value={entry.name}>
                                            {entry.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                  {child.view === "" && child.requiredPath ? (
                                    <p className="form-error">
                                      Collection requise : choisissez une vue source.
                                    </p>
                                  ) : null}
                                  {child.view !== "" && child.foreignKey === "" ? (
                                    <>
                                      <p className="form-error">Clé de rattachement requise.</p>
                                      {guessForeignKey(
                                        child.path,
                                        childView?.columns ?? [],
                                        draft.rootPath,
                                      ) === "" ? (
                                        <p className="hint">
                                          Aucune colonne de rattachement évidente : choisissez la
                                          colonne qui contient l'identifiant de l'élément parent.
                                        </p>
                                      ) : null}
                                    </>
                                  ) : null}
                                  {childView !== undefined ? (
                                    <>
                                      <table className="table">
                                        <thead>
                                          <tr>
                                            <th>Champ du contrat</th>
                                            <th>Colonne source</th>
                                            <th>Alias SQL</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {child.fields.map((field) => {
                                            const column = child.mapping[field] ?? "";
                                            const required = child.required.includes(field);
                                            return (
                                              <tr key={field}>
                                                <td>
                                                  <code>{field}</code>
                                                  {required ? " *" : ""}
                                                </td>
                                                <td>
                                                  <select
                                                    className="input"
                                                    value={column}
                                                    onChange={(event) =>
                                                      patchChild(child.path, {
                                                        mapping: {
                                                          ...child.mapping,
                                                          [field]: event.target.value,
                                                        },
                                                      })
                                                    }
                                                  >
                                                    <option value="">— ignorer —</option>
                                                    {childView.columns.map((entry) => (
                                                      <option key={entry.name} value={entry.name}>
                                                        {entry.name}
                                                      </option>
                                                    ))}
                                                  </select>
                                                </td>
                                                <td>
                                                  <code>
                                                    {column === ""
                                                      ? "—"
                                                      : column === field
                                                        ? column
                                                        : `${column} AS ${field}`}
                                                  </code>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                      <div className="composer-row">
                                        <label className="field">
                                          <span>Tri</span>
                                          <select
                                            className="input"
                                            value={child.orderBy}
                                            onChange={(event) =>
                                              patchChild(child.path, {
                                                orderBy: event.target.value,
                                              })
                                            }
                                          >
                                            <option value="">Aucun</option>
                                            {childView.columns.map((entry) => (
                                              <option key={entry.name} value={entry.name}>
                                                {entry.name}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="field">
                                          <span>Sens</span>
                                          <select
                                            className="input"
                                            value={child.orderDirection}
                                            onChange={(event) =>
                                              patchChild(child.path, {
                                                orderDirection:
                                                  event.target.value === "desc" ? "desc" : "asc",
                                              })
                                            }
                                          >
                                            <option value="asc">Croissant</option>
                                            <option value="desc">Décroissant</option>
                                          </select>
                                        </label>
                                      </div>
                                      <div className="composer-section">
                                        <div className="field-head">
                                          <strong>Filtres</strong>
                                          <button
                                            className="btn ghost small"
                                            type="button"
                                            onClick={() => addChildFilter(child.path)}
                                          >
                                            + Filtre
                                          </button>
                                        </div>
                                        {child.filters.length === 0 ? (
                                          <p className="hint" style={{ margin: 0 }}>
                                            Aucun filtre.
                                          </p>
                                        ) : (
                                          child.filters.map((filter) => (
                                            <div className="composer-row" key={filter.id}>
                                              <select
                                                className="input"
                                                value={filter.column}
                                                onChange={(event) =>
                                                  patchChildFilter(child.path, filter.id, {
                                                    column: event.target.value,
                                                  })
                                                }
                                              >
                                                {childView.columns.map((entry) => (
                                                  <option key={entry.name} value={entry.name}>
                                                    {entry.name}
                                                  </option>
                                                ))}
                                              </select>
                                              <select
                                                className="input"
                                                value={filter.operator}
                                                onChange={(event) =>
                                                  patchChildFilter(child.path, filter.id, {
                                                    operator: event.target.value as FilterOperator,
                                                  })
                                                }
                                              >
                                                {FILTER_OPERATORS.map((operator) => (
                                                  <option key={operator} value={operator}>
                                                    {operator}
                                                  </option>
                                                ))}
                                              </select>
                                              <input
                                                className="input"
                                                placeholder="valeur"
                                                value={filter.value}
                                                disabled={
                                                  filter.operator === "IS NULL" ||
                                                  filter.operator === "IS NOT NULL"
                                                }
                                                onChange={(event) =>
                                                  patchChildFilter(child.path, filter.id, {
                                                    value: event.target.value,
                                                  })
                                                }
                                              />
                                              <button
                                                className="btn ghost small"
                                                type="button"
                                                onClick={() =>
                                                  removeChildFilter(child.path, filter.id)
                                                }
                                              >
                                                Retirer
                                              </button>
                                            </div>
                                          ))
                                        )}
                                        <span className="hint">
                                          Pour <code>ILIKE</code>, utilisez des jokers :{" "}
                                          <code>%mot%</code>.
                                        </span>
                                      </div>
                                      {childSql !== undefined ? (
                                        <>
                                          <span className="hint">
                                            Requête enfant « {child.path} » — clé{" "}
                                            {child.foreignKey || "à définir"}
                                          </span>
                                          <pre className="composer-sql">{childSql}</pre>
                                        </>
                                      ) : null}
                                    </>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        <div className="composer-row">
                          <button
                            className="btn"
                            type="button"
                            disabled={
                              composerSql === "" ||
                              composerMissing.length > 0 ||
                              composerChildIssues.length > 0
                            }
                            onClick={applyComposer}
                          >
                            Appliquer les requêtes
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => setComposer(null)}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    </div>
                  </aside>
                </>
              ) : null}

              {canWrite ? (
                <div className="tools editor-footer">
                  <button
                    className="btn ghost icon"
                    type="button"
                    aria-label="Précédent"
                    title="Précédent"
                    disabled={step === 1}
                    onClick={() => setStep(step === 3 ? 2 : 1)}
                  >
                    <IconArrowLeft />
                  </button>
                  {step < 3 ? (
                    <button
                      className="btn ghost icon"
                      type="button"
                      aria-label="Suivant"
                      title="Suivant"
                      onClick={() => setStep(step === 1 ? 2 : 3)}
                    >
                      <IconArrowRight />
                    </button>
                  ) : null}
                  <span className="editor-footer-spacer" />
                  {step === 3 ? (
                    <button
                      className="btn ghost icon"
                      type="button"
                      aria-label="Aperçu"
                      title="Aperçu"
                      disabled={busy}
                      onClick={() => void preview()}
                    >
                      <IconEye />
                    </button>
                  ) : null}
                  <button
                    className="btn icon"
                    type="button"
                    aria-label="Enregistrer"
                    title="Enregistrer"
                    disabled={busy}
                    onClick={() => void save()}
                  >
                    <IconCheck />
                  </button>
                </div>
              ) : null}

              {message[contract.key] ? <p className="hint">{message[contract.key]}</p> : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
