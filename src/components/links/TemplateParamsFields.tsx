"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { TemplateParamSchema, TemplateParamValues } from "@/domain/template-params";
import { isCompleteColorInput, normalizeColorInput } from "./color-input";

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
            ) : param.type === "color" ? (
              <div>
                <span className="param-label">{param.label}</span>
                <ColorParamField
                  id={controlId}
                  label={param.label}
                  value={typeof value === "string" ? value : String(param.default)}
                  defaultValue={String(param.default)}
                  onChange={(next) => set(param.key, next)}
                />
              </div>
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
