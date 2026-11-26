"use client";

import { useState } from "react";
import type { TemplateEditOperation, TemplateEditProposal } from "@/domain/template-edit-proposal";
import type { TemplateEditCandidate } from "@/domain/template-edit-target";

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function recordText(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function operationTitle(operation: TemplateEditOperation, fallback: string): string {
  if (operation.op === "insert") {
    const values = recordText(operation.values);
    const label = text(values.title) || text(values.name) || text(values.slug);
    return label === ""
      ? `Créer un élément dans ${operation.target.collection}`
      : `Créer « ${label} »`;
  }
  if (operation.op === "insertChild") {
    const label = text(operation.child.values.title) || text(operation.child.values.name);
    return label === "" ? `Ajouter un ${operation.child.kind}` : `Ajouter « ${label} »`;
  }
  if (operation.op === "set") {
    if (operation.target.kind === "param") return `Modifier ${operation.target.path}`;
    if (operation.target.kind === "collectionItemField") {
      return `Modifier ${operation.target.field} de « ${operation.target.itemId} »`;
    }
    return "Modifier un élément";
  }
  if (operation.op === "remove") {
    return operation.target.kind === "param"
      ? `Supprimer ${operation.target.path}`
      : `Supprimer « ${operation.target.itemId} »`;
  }
  if (operation.op === "duplicate") {
    return operation.target.kind === "param"
      ? `Dupliquer ${operation.target.path}`
      : `Dupliquer « ${operation.target.itemId} »`;
  }
  if (operation.op === "move") {
    return operation.target.kind === "param"
      ? `Déplacer ${operation.target.path}`
      : `Déplacer « ${operation.target.itemId} »`;
  }
  return fallback;
}

function operationDetails(operation: TemplateEditOperation): string[] {
  if (operation.op === "insert") {
    const values = recordText(operation.values);
    return Object.entries(values)
      .map(([key, value]) => `${key} : ${text(value)}`)
      .filter((line) => line !== "");
  }
  if (operation.op === "insertChild") {
    return [
      `collection : ${operation.child.collection}`,
      `kind : ${operation.child.kind}`,
      `slot : ${operation.child.slot}`,
      ...Object.entries(operation.child.values).map(([key, value]) => `${key} : ${text(value)}`),
    ];
  }
  if (operation.op === "set") {
    return [`nouvelle valeur : ${text(operation.value)}`];
  }
  if (operation.op === "move") {
    return [`parent : ${text(operation.parent)}`, `position : ${operation.position}`];
  }
  return [];
}

export function PlanProposal({
  proposal,
  candidate,
  applying,
  onApply,
  onCancel,
}: {
  proposal: TemplateEditProposal;
  candidate: TemplateEditCandidate | null | undefined;
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [technical, setTechnical] = useState(false);
  const operations = proposal.operations;
  const warnings = proposal.warnings ?? [];

  return (
    <section className="display-assistant-proposal" aria-label="Plan proposé">
      <div className="display-assistant-proposal-head">
        <div>
          <strong>Plan proposé</strong>
          <span className="hint">
            {candidate === null || candidate === undefined
              ? `${operations.length} étape${operations.length > 1 ? "s" : ""}`
              : candidate.label}
          </span>
        </div>
        <button
          type="button"
          className="btn ghost small"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Masquer les détails" : "Voir les détails"}
        </button>
      </div>

      <ol className="display-assistant-plan-list">
        {operations.map((operation, index) => (
          <li key={JSON.stringify(operation)}>
            <span className="display-assistant-step-number">{index + 1}</span>
            <div>
              <strong>{operationTitle(operation, `Étape ${index + 1}`)}</strong>
              {open ? (
                <div className="display-assistant-step-details">
                  {operationDetails(operation).map((detail) => (
                    <span key={detail}>{detail}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {warnings.map((warning) => (
        <p key={warning} className="hint">
          {warning}
        </p>
      ))}

      {open ? (
        <button
          type="button"
          className="btn ghost small"
          onClick={() => setTechnical((value) => !value)}
        >
          {technical ? "Masquer le technique" : "Voir le technique"}
        </button>
      ) : null}

      {open && technical ? (
        <pre className="display-assistant-technical">{JSON.stringify(operations, null, 2)}</pre>
      ) : null}

      <div className="display-assistant-actions">
        <button type="button" className="btn small" disabled={applying} onClick={onApply}>
          {applying ? "Application…" : "Appliquer au brouillon"}
        </button>
        <button type="button" className="btn ghost small" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </section>
  );
}
