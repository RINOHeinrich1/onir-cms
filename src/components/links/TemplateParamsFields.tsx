"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { TemplateEditorCollection, TemplateEditorReference } from "@/domain/template-editor";
import type {
  TemplateParamNode,
  TemplateParamScalar,
  TemplateParamSchema,
  TemplateParamValue,
  TemplateParamValues,
} from "@/domain/template-params";
import { createTemplateItemId } from "@/domain/template-structure-operations";
import { isCompleteColorInput, normalizeColorInput } from "./color-input";

type TemplateParamsFieldsProps = {
  schema: TemplateParamSchema[];
  values: TemplateParamValues;
  onChange: (values: TemplateParamValues) => void;
  /** Chemins visibles (mode inspection par zone, ADR-0105). */
  visiblePaths?: ReadonlySet<string> | undefined;
  /** Libellé du fieldset. */
  legend?: string;
  /** Métadonnées de collections Editor V2. */
  collections?: TemplateEditorCollection[] | undefined;
  references?: TemplateEditorReference[] | undefined;
  /** Élément ciblé par une région dynamique. */
  collectionFocus?: { param: string; keyField: string; itemId: string } | undefined;
  /** Clés stockées qui ne sont plus déclarées par la version (ADR-0023). */
  orphans?: string[];
  onRemoveOrphan?: (key: string) => void;
};

function isObject(
  value: TemplateParamValue | undefined,
): value is Record<string, TemplateParamValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSameValue(left: TemplateParamValue, right: TemplateParamValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneValue(value: TemplateParamValue): TemplateParamValue {
  return JSON.parse(JSON.stringify(value)) as TemplateParamValue;
}

function controlId(path: string): string {
  return `template-param-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function itemSummary(
  value: TemplateParamValue,
  index: number,
  fallback: string,
  collection: TemplateEditorCollection | undefined,
): string {
  if (isObject(value)) {
    const keys = [
      collection?.itemLabel,
      ...(collection?.labelFallback ?? []),
      "title",
      "name",
      "slug",
      "id",
    ].filter((key): key is string => key !== undefined && key !== "");
    const candidate = keys
      .map((key) => value[key])
      .find((entry) => typeof entry === "string" && entry.trim() !== "");
    if (typeof candidate === "string") return candidate;
  }
  if (typeof value === "string" && value.trim() !== "") return value;
  return `${fallback} ${index + 1}`;
}

function itemKind(
  value: TemplateParamValue,
  collection: TemplateEditorCollection | undefined,
): string | null {
  if (!isObject(value)) return null;
  const configured = collection?.itemKind;
  if (configured !== undefined) {
    const valueForKind = value[configured];
    if (typeof valueForKind === "string" && valueForKind !== "") return valueForKind;
  }
  return typeof value.kind === "string" && value.kind !== "" ? value.kind : null;
}

/**
 * Champs de paramétrage générés depuis le schéma du template (ADR-0023 / ADR-0095).
 * Aucun libellé ni règle métier n'est codé ici : le cœur ne connaît que les
 * types du contrat.
 */
function isPathVisible(path: string, visiblePaths: ReadonlySet<string> | undefined): boolean {
  if (visiblePaths === undefined || visiblePaths.size === 0) return true;
  for (const visible of visiblePaths) {
    if (
      visible === path ||
      visible.startsWith(`${path}.`) ||
      visible.startsWith(`${path}[`) ||
      path.startsWith(`${visible}.`) ||
      path.startsWith(`${visible}[`)
    ) {
      return true;
    }
  }
  return false;
}

export function TemplateParamsFields({
  schema,
  values,
  onChange,
  visiblePaths,
  legend = "Paramètres du template",
  collections,
  references,
  collectionFocus,
  orphans = [],
  onRemoveOrphan,
}: TemplateParamsFieldsProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());

  if (schema.length === 0 && orphans.length === 0) return null;
  const toggle = (path: string): void => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const set = (key: string, value: TemplateParamValue): void => {
    onChange({ ...values, [key]: value });
  };

  return (
    <fieldset className="field">
      <legend>
        {legend}
        {expandedPaths.size === 0 ? null : (
          <button
            type="button"
            className="btn ghost small"
            style={{ marginLeft: "0.5rem" }}
            onClick={() => setExpandedPaths(new Set())}
          >
            Tout replier
          </button>
        )}
      </legend>
      {schema.length === 0 ? (
        <span className="hint">Cette version ne déclare aucun paramètre.</span>
      ) : null}
      {schema.map((param) => {
        const current = values[param.key];
        return (
          <ParamField
            key={param.key}
            param={param}
            value={current === undefined ? cloneValue(param.default) : current}
            onChange={(next) => set(param.key, next)}
            path={param.key}
            visiblePaths={visiblePaths}
            expandedPaths={expandedPaths}
            onToggle={toggle}
            collections={collections}
            references={references}
            values={values}
            collectionFocus={collectionFocus}
          />
        );
      })}
      {orphans.length === 0 ? null : (
        <div className="hint">
          <p>Valeurs conservées mais non utilisées par cette version :</p>
          <ul>
            {orphans.map((key) => (
              <li key={key}>
                <span className="badge">{key}</span> n&apos;est plus utilisée par cette version.
                {onRemoveOrphan === undefined ? null : (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => onRemoveOrphan(key)}
                    >
                      Retirer
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </fieldset>
  );
}

function ParamField({
  param,
  value,
  onChange,
  path,
  visiblePaths,
  expandedPaths,
  onToggle,
  collections,
  references,
  values,
  collectionFocus,
  record,
}: {
  param: TemplateParamSchema;
  value: TemplateParamValue;
  onChange: (next: TemplateParamValue) => void;
  path: string;
  visiblePaths: ReadonlySet<string> | undefined;
  expandedPaths: ReadonlySet<string>;
  onToggle: (path: string) => void;
  collections: TemplateEditorCollection[] | undefined;
  references: TemplateEditorReference[] | undefined;
  values: TemplateParamValues;
  collectionFocus: { param: string; keyField: string; itemId: string } | undefined;
  record?: Record<string, TemplateParamValue> | undefined;
}) {
  if (!isPathVisible(path, visiblePaths)) return null;
  const isDefault = isSameValue(value, param.default);
  const isCollection = param.type === "object" || param.type === "array";
  const focused = collectionFocus?.param === path;
  const expanded = focused || expandedPaths.has(path);
  return (
    <div className="param-field" data-param-path={path}>
      {isCollection ? (
        <button
          type="button"
          className="param-label"
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            textAlign: "left",
            cursor: "pointer",
          }}
          onClick={() => onToggle(path)}
        >
          {expanded ? "▾" : "▸"} {param.label}
          {param.type === "array" ? ` (${Array.isArray(value) ? value.length : 0})` : ""}
        </button>
      ) : param.type === "boolean" ? (
        <label className="check">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />{" "}
          {param.label}
        </label>
      ) : (
        <span className="param-label">{param.label}</span>
      )}
      {param.type === "boolean" || (isCollection && !expanded) ? null : (
        <ParamValueEditor
          node={param}
          value={value}
          onChange={onChange}
          path={path}
          label={param.label}
          visiblePaths={visiblePaths}
          expandedPaths={expandedPaths}
          onToggle={onToggle}
          collections={collections}
          references={references}
          values={values}
          record={record}
          collectionFocus={collectionFocus}
        />
      )}
      {param.description === "" ? null : <span className="hint">{param.description}</span>}
      {isDefault || isCollection ? null : (
        <button
          type="button"
          className="btn ghost small"
          onClick={() => onChange(cloneValue(param.default))}
        >
          Réinitialiser
        </button>
      )}
    </div>
  );
}

type ReferenceTarget = {
  collection: string;
  targetKey: string;
  optional: boolean;
};

function referenceForPath(
  path: string,
  references: TemplateEditorReference[] | undefined,
): TemplateEditorReference | undefined {
  if (references === undefined) return undefined;
  const match = /^([a-z][a-z0-9_]*)\[\d+\]\.([a-z][a-z0-9_]*)$/.exec(path);
  if (match === null) return undefined;
  return references.find(
    (reference) => reference.from === match[1] && reference.field === match[2],
  );
}

function referenceTarget(
  reference: TemplateEditorReference,
  record: Record<string, TemplateParamValue> | undefined,
): ReferenceTarget | null {
  if (reference.to !== undefined) {
    return {
      collection: reference.to,
      targetKey: reference.targetKey,
      optional: reference.optional === true,
    };
  }
  if (reference.targets === undefined) return null;
  const discriminator =
    reference.discriminator === undefined ? "" : String(record?.[reference.discriminator] ?? "");
  const target = reference.targets[discriminator];
  return target === undefined
    ? null
    : {
        collection: target,
        targetKey: reference.targetKey,
        optional: reference.optional === true,
      };
}

function referenceLabel(
  value: TemplateParamValue,
  collection: TemplateEditorCollection | undefined,
): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return "";
  const keys = [
    collection?.itemLabel,
    ...(collection?.labelFallback ?? []),
    "title",
    "name",
    "label",
    "slug",
    "id",
  ].filter((key): key is string => key !== undefined && key !== "");
  for (const key of keys) {
    const candidate = (value as Record<string, TemplateParamValue>)[key];
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  return "";
}

function ReferenceSelect({
  reference,
  value,
  values,
  collections,
  record,
  onChange,
}: {
  reference: TemplateEditorReference;
  value: string;
  values: TemplateParamValues;
  collections: TemplateEditorCollection[] | undefined;
  record: Record<string, TemplateParamValue> | undefined;
  onChange: (next: TemplateParamValue) => void;
}): ReactNode {
  const target = referenceTarget(reference, record);
  if (target === null) return null;
  const raw = values[target.collection];
  const items = Array.isArray(raw) ? raw.filter(isObject) : [];
  const collection = collections?.find((entry) => entry.param === target.collection);
  const options = items
    .map((item) => {
      const key = item[target.targetKey];
      if (typeof key !== "string" || key === "") return null;
      const label = referenceLabel(item, collection);
      return { key, label: label === "" ? key : label };
    })
    .filter((option): option is { key: string; label: string } => option !== null);
  if (options.length === 0 && !target.optional) return null;
  const hasCurrent = options.some((option) => option.key === value);
  const labelCounts = new Map<string, number>();
  for (const option of options) {
    labelCounts.set(option.label, (labelCounts.get(option.label) ?? 0) + 1);
  }
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {target.optional || value === "" ? <option value="">Non défini</option> : null}
      {!hasCurrent && value !== "" ? <option value={value}>Valeur actuelle</option> : null}
      {options.map((option) => (
        <option key={option.key} value={option.key}>
          {labelCounts.get(option.label) === 1 ? option.label : `${option.label} · ${option.key}`}
        </option>
      ))}
    </select>
  );
}

function ParamValueEditor({
  node,
  value,
  onChange,
  path,
  label,
  visiblePaths,
  expandedPaths,
  onToggle,
  collections,
  references,
  values,
  collectionFocus,
  hiddenKeys,
  record,
}: {
  node: TemplateParamNode;
  value: TemplateParamValue;
  onChange: (next: TemplateParamValue) => void;
  path: string;
  label: string;
  visiblePaths: ReadonlySet<string> | undefined;
  expandedPaths: ReadonlySet<string>;
  onToggle: (path: string) => void;
  collections: TemplateEditorCollection[] | undefined;
  references: TemplateEditorReference[] | undefined;
  values: TemplateParamValues;
  collectionFocus: { param: string; keyField: string; itemId: string } | undefined;
  hiddenKeys?: ReadonlySet<string> | undefined;
  record?: Record<string, TemplateParamValue> | undefined;
}): ReactNode {
  if (node.type === "object") {
    const source = isObject(value) ? value : {};
    return (
      <div className="param-object">
        {(node.properties ?? [])
          .filter((property) => hiddenKeys?.has(property.key) !== true)
          .map((property) => (
            <ParamField
              key={property.key}
              param={property}
              value={
                source[property.key] === undefined
                  ? cloneValue(property.default)
                  : (source[property.key] as TemplateParamValue)
              }
              onChange={(next) => onChange({ ...source, [property.key]: next })}
              path={`${path}.${property.key}`}
              visiblePaths={visiblePaths}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              collections={collections}
              references={references}
              values={values}
              record={source}
              collectionFocus={collectionFocus}
            />
          ))}
      </div>
    );
  }

  if (node.type === "array") {
    const items = Array.isArray(value) ? value : [];
    const itemNode = node.items;
    if (itemNode === undefined) {
      return <span className="hint">Tableau sans schéma d&apos;élément.</span>;
    }
    const minItems = node.minItems ?? 0;
    const maxItems = node.maxItems ?? 100;
    const collection = collections?.find((entry) => entry.param === path);
    const focus = collectionFocus?.param === path ? collectionFocus : null;
    const entries = items
      .map((entry, index) => ({ entry, index }))
      .filter(
        ({ entry, index }) =>
          (focus === null || (isObject(entry) && entry[focus.keyField] === focus.itemId)) &&
          isPathVisible(`${path}[${index}]`, visiblePaths),
      );
    return (
      <div className="param-array">
        {focus !== null && entries.length === 0 ? (
          <span className="hint">Élément ciblé introuvable dans cette collection.</span>
        ) : null}
        {entries.map(({ entry, index }) => {
          const itemPath = `${path}[${index}]`;
          const itemExpanded = focus !== null || expandedPaths.has(itemPath);
          const kind = itemKind(entry, collection);
          return (
            <div className="param-array-item" key={itemPath}>
              <div className="param-array-item-head">
                <button
                  type="button"
                  className="param-label"
                  style={{
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  onClick={() => onToggle(itemPath)}
                >
                  {itemExpanded ? "▾" : "▸"} {itemSummary(entry, index, label, collection)}
                  {kind === null ? null : <span className="badge muted">{kind}</span>}
                </button>
                {focus === null ? (
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={items.length <= minItems}
                    onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Supprimer
                  </button>
                ) : null}
              </div>
              {itemExpanded ? (
                <ParamValueEditor
                  node={itemNode}
                  value={entry}
                  onChange={(next) => {
                    const copy = [...items];
                    copy[index] = next;
                    onChange(copy);
                  }}
                  path={itemPath}
                  label={`${label} ${index + 1}`}
                  visiblePaths={visiblePaths}
                  expandedPaths={expandedPaths}
                  onToggle={onToggle}
                  collections={collections}
                  references={references}
                  values={values}
                  collectionFocus={collectionFocus}
                  hiddenKeys={collection === undefined ? undefined : new Set([collection.itemKey])}
                  record={isObject(entry) ? entry : undefined}
                />
              ) : null}
            </div>
          );
        })}
        {focus === null ? (
          <button
            type="button"
            className="btn ghost small"
            disabled={items.length >= maxItems}
            onClick={() => {
              const next = cloneValue(itemNode.default);
              if (collection !== undefined && isObject(next)) {
                next[collection.itemKey] = createTemplateItemId();
              }
              onChange([...items, next]);
            }}
          >
            Ajouter un élément
          </button>
        ) : null}
      </div>
    );
  }

  const reference = referenceForPath(path, references);
  if (reference !== undefined) {
    return (
      <ReferenceSelect
        reference={reference}
        value={typeof value === "string" ? value : ""}
        values={values}
        collections={collections}
        record={record}
        onChange={onChange}
      />
    );
  }

  if (node.type === "boolean") {
    return (
      <label className="check">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />{" "}
        {label}
      </label>
    );
  }

  return (
    <ScalarParamControl
      param={node}
      value={value}
      onChange={onChange}
      controlId={controlId(path)}
      label={label}
    />
  );
}

function ScalarParamControl({
  param,
  value,
  onChange,
  controlId,
  label,
}: {
  param: TemplateParamNode;
  value: TemplateParamValue;
  onChange: (next: TemplateParamValue) => void;
  controlId: string;
  label: string;
}) {
  if (param.type === "image") {
    return (
      <ImageParamField
        id={controlId}
        value={typeof value === "string" ? value : ""}
        onChange={(next) => onChange(next)}
      />
    );
  }
  if (param.type === "color") {
    const defaultValue = typeof param.default === "string" ? param.default : "#000000";
    return (
      <ColorParamField
        id={controlId}
        label={label}
        value={typeof value === "string" ? value : defaultValue}
        defaultValue={defaultValue}
        onChange={(next) => onChange(next)}
      />
    );
  }
  return renderControl(
    param,
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? value
      : "",
    onChange as (next: TemplateParamScalar) => void,
    controlId,
  );
}

type ImageParamFieldProps = {
  id: string;
  value: string;
  onChange: (next: string) => void;
};

function assetIdFromUrl(url: string): string | null {
  const match = /^\/api\/template-param-assets\/([0-9a-f-]+)$/i.exec(url);
  return match?.[1] ?? null;
}

function ImageParamField({ id, value, onChange }: ImageParamFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const upload = async (file: File): Promise<void> => {
    setUploading(true);
    setError(null);
    setPreviewFailed(false);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/template-param-assets", { method: "POST", body });
      const payload = (await response.json()) as { url?: unknown; error?: unknown };
      if (!response.ok || typeof payload.url !== "string") {
        throw new Error(typeof payload.error === "string" ? payload.error : "Upload impossible");
      }
      onChange(payload.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload impossible");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (): Promise<void> => {
    const assetId = assetIdFromUrl(value);
    if (assetId !== null) {
      await fetch(`/api/template-param-assets/${assetId}`, { method: "DELETE" }).catch(
        () => undefined,
      );
    }
    onChange("");
    setPreviewFailed(false);
  };

  return (
    <span className="param-image">
      {value === "" ? (
        <span className="hint">Aucune image.</span>
      ) : (
        <span className="param-image-preview">
          {/* biome-ignore lint/performance/noImgElement: aperçu local d'un asset contrôlé */}
          <img src={value} alt="" onError={() => setPreviewFailed(true)} hidden={previewFailed} />
          {previewFailed ? <span className="hint">Image indisponible.</span> : null}
        </span>
      )}
      <span className="param-image-actions">
        <label className="btn subtle small" htmlFor={id}>
          {uploading ? "Upload…" : value === "" ? "Choisir un fichier" : "Remplacer"}
        </label>
        <input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file !== undefined) void upload(file);
          }}
        />
        {value === "" ? null : (
          <button type="button" className="btn ghost small" onClick={() => void remove()}>
            Supprimer
          </button>
        )}
      </span>
      {error === null ? null : (
        <span className="param-image-error" role="alert">
          {error}
        </span>
      )}
      <span className="hint">PNG, JPEG ou WebP — 2 Mo maximum.</span>
    </span>
  );
}

type ColorParamFieldProps = {
  id: string;
  label: string;
  value: string;
  defaultValue: string;
  onChange: (next: string) => void;
};

function ColorParamField({ id, label, value, defaultValue, onChange }: ColorParamFieldProps) {
  const normalized = value === "" ? defaultValue : value;
  const [text, setText] = useState(normalized);
  const [error, setError] = useState(false);

  useEffect(() => {
    setText(normalized);
    setError(false);
  }, [normalized]);

  const commit = (raw: string): void => {
    if (raw.trim() === "") {
      setText(normalized);
      setError(false);
      return;
    }
    const next = normalizeColorInput(raw);
    if (next === null) {
      setError(true);
      return;
    }
    setError(false);
    setText(next);
    if (next !== normalized) onChange(next);
  };

  return (
    <span className="param-color">
      <input
        id={id}
        type="color"
        value={normalized}
        aria-label={`${label} : sélecteur`}
        onChange={(event) => {
          setError(false);
          setText(event.target.value);
          onChange(event.target.value);
        }}
      />
      <span className="param-color-text">
        <input
          type="text"
          value={text}
          placeholder="#023777 ou rgb(2, 55, 119)"
          aria-label={`${label} : code couleur`}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            const raw = event.target.value;
            setText(raw);
            setError(false);
            if (isCompleteColorInput(raw)) {
              const next = normalizeColorInput(raw);
              if (next !== null) onChange(next);
            }
          }}
          onBlur={() => commit(text)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(text);
            }
          }}
        />
        {error ? (
          <span className="param-color-error" role="alert">
            Format attendu : #RRGGBB ou rgb(r, g, b).
          </span>
        ) : null}
      </span>
    </span>
  );
}

function renderControl(
  param: TemplateParamNode,
  value: TemplateParamScalar,
  onChange: (next: TemplateParamScalar) => void,
  controlId: string,
): ReactNode {
  switch (param.type) {
    case "text":
      return (
        <textarea
          id={controlId}
          rows={3}
          maxLength={param.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "number":
      return (
        <input
          id={controlId}
          type="number"
          step="any"
          min={param.min}
          max={param.max}
          value={typeof value === "number" ? String(value) : String(param.default)}
          onChange={(event) => {
            if (event.target.value === "") {
              if (typeof param.default === "number") onChange(param.default);
              return;
            }
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
        />
      );
    case "select":
      return (
        <select
          id={controlId}
          value={typeof value === "string" ? value : String(param.default)}
          onChange={(event) => onChange(event.target.value)}
        >
          {(param.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case "url":
      return (
        <input
          id={controlId}
          type="url"
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <input
          id={controlId}
          type="text"
          maxLength={param.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}
