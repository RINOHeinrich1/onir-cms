"use client";

import type { ReactNode } from "react";
import type { TemplateParamSchema, TemplateParamValues } from "@/domain/template-params";

type TemplateParamsFieldsProps = {
  schema: TemplateParamSchema[];
  values: TemplateParamValues;
  onChange: (values: TemplateParamValues) => void;
  /** Clés stockées qui ne sont plus déclarées par la version (ADR-0023). */
  orphans?: string[];
  onRemoveOrphan?: (key: string) => void;
};

/**
 * Champs de paramétrage **générés depuis le schéma** du template (ADR-0023).
 * Aucun libellé ni règle métier n'est codé ici : le cœur ne connaît que les
 * types du contrat.
 */
export function TemplateParamsFields({
  schema,
  values,
  onChange,
  orphans = [],
  onRemoveOrphan,
}: TemplateParamsFieldsProps) {
  if (schema.length === 0 && orphans.length === 0) return null;

  const set = (key: string, value: string | number | boolean): void => {
    onChange({ ...values, [key]: value });
  };

  return (
    <fieldset className="field">
      <legend>Paramètres du template</legend>
      {schema.length === 0 ? (
        <span className="hint">Cette version ne déclare aucun paramètre.</span>
      ) : null}
      {schema.map((param) => {
        const current = values[param.key];
        const value = current === undefined ? param.default : current;
        const isDefault = value === param.default;
        const controlId = `template-param-${param.key}`;
        return (
          <div key={param.key} className="param-field">
            {param.type === "boolean" ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={value === true}
                  onChange={(event) => set(param.key, event.target.checked)}
                />{" "}
                {param.label}
              </label>
            ) : (
              <label htmlFor={controlId}>
                {param.label}
                {renderControl(param, value, (next) => set(param.key, next), controlId)}
              </label>
            )}
            {param.description === "" ? null : <span className="hint">{param.description}</span>}
            {isDefault ? null : (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => set(param.key, param.default)}
              >
                Réinitialiser
              </button>
            )}
          </div>
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

function renderControl(
  param: TemplateParamSchema,
  value: string | number | boolean,
  onChange: (next: string | number | boolean) => void,
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
              onChange(param.default);
              return;
            }
            const parsed = Number(event.target.value);
            if (Number.isFinite(parsed)) onChange(parsed);
          }}
        />
      );
    case "color":
      return (
        <input
          id={controlId}
          type="color"
          value={typeof value === "string" ? value : String(param.default)}
          onChange={(event) => onChange(event.target.value)}
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
