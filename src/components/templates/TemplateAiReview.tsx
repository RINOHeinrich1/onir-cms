"use client";

import { PROMPT_GUARDRAILS, PROMPT_TONES } from "@/domain/template-defaults";
import type { TemplateAiGenerationDto, TemplateAiKnowledgeDto } from "./ai-types";

function guardrailLabel(id: string): string {
  return PROMPT_GUARDRAILS.find((guardrail) => guardrail.id === id)?.label ?? id;
}

function toneLabel(value: string): string {
  return PROMPT_TONES.find((tone) => tone.value === value)?.label ?? value;
}

export function TemplateAiReview({
  result,
  knowledge,
  onKnowledgeChange,
  onAdjustSimple,
  onExpert,
}: {
  result: TemplateAiGenerationDto;
  knowledge: TemplateAiKnowledgeDto[];
  onKnowledgeChange: (knowledge: TemplateAiKnowledgeDto[]) => void;
  onAdjustSimple: () => void;
  onExpert: () => void;
}) {
  const updateKnowledge = (index: number, patch: Partial<TemplateAiKnowledgeDto>): void => {
    onKnowledgeChange(
      knowledge.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    );
  };

  return (
    <section className="template-ai-review">
      <div className="template-ai-review-head">
        <div>
          <span className="eyebrow">Brouillon IA à valider</span>
          <h3>{result.draft.label}</h3>
          <p className="muted-text">{result.draft.description}</p>
        </div>
        <span className="pill">
          {result.providerLabel} · {result.model}
        </span>
      </div>

      <p className="alert success">
        Le brouillon est prêt mais il n'est pas encore enregistré. Vérifiez-le puis cliquez sur «
        Enregistrer » en bas du formulaire.
      </p>

      <dl className="template-ai-summary">
        <dt>Rôle</dt>
        <dd>{result.draft.role}</dd>
        <dt>Objectif</dt>
        <dd>{result.draft.objective}</dd>
        <dt>Ton</dt>
        <dd>{toneLabel(result.draft.tone)}</dd>
        <dt>Garde-fous</dt>
        <dd>{result.draft.guardrails.map(guardrailLabel).join(" · ")}</dd>
      </dl>

      <div className="template-ai-section">
        <h4>Informations à collecter</h4>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Libellé</th>
                <th>Type</th>
                <th>Obligatoire</th>
                <th>Exemple</th>
              </tr>
            </thead>
            <tbody>
              {result.draft.fields.map((field) => (
                <tr key={field.name}>
                  <td>{field.label}</td>
                  <td>{field.type}</td>
                  <td>{field.required ? "Oui" : "Non"}</td>
                  <td>{field.example ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="template-ai-section">
        <h4>Connaissances proposées ({knowledge.length})</h4>
        <p className="hint">
          Elles seront rattachées à ce modèle. Modifiez ou retirez celles qui ne doivent pas être
          enregistrées.
        </p>
        {knowledge.length === 0 ? (
          <p className="hint">Aucune connaissance proposée.</p>
        ) : (
          <div className="template-ai-knowledge">
            {knowledge.map((item, index) => (
              <div className="template-ai-knowledge-row" key={item.titre}>
                <label className="field">
                  Titre
                  <input
                    type="text"
                    value={item.titre}
                    maxLength={120}
                    onChange={(event) => updateKnowledge(index, { titre: event.target.value })}
                  />
                </label>
                <label className="field">
                  Contenu
                  <textarea
                    rows={3}
                    value={item.contenu}
                    onChange={(event) => updateKnowledge(index, { contenu: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="btn danger ghost small"
                  onClick={() => onKnowledgeChange(knowledge.filter((_entry, i) => i !== index))}
                >
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}
        {result.existingAiKnowledgeCount > 0 ? (
          <p className="alert warning">
            Ce modèle possède déjà {result.existingAiKnowledgeCount} connaissance(s) générée(s) par
            l'IA. Vous pourrez choisir de les remplacer ou d'ajouter les nouvelles à
            l'enregistrement.
          </p>
        ) : null}
      </div>

      <details className="template-ai-prompt">
        <summary>Voir le prompt et la fiche générés</summary>
        <label className="field">
          Prompt système
          <textarea rows={8} value={result.draft.systemPrompt} readOnly />
        </label>
        <label className="field">
          Fiche Markdown
          <textarea rows={8} value={result.draft.renderTemplate} readOnly />
        </label>
      </details>

      {result.sources.files.length > 0 || result.sources.pages.length > 0 ? (
        <div className="template-ai-sources">
          <strong>Sources analysées</strong>
          <ul>
            {result.sources.pages.map((page) => (
              <li key={page.url}>
                {page.title} — {page.chars.toLocaleString("fr-FR")} caractères
              </li>
            ))}
            {result.sources.files.map((file) => (
              <li key={file.name}>
                {file.name} — {file.chars.toLocaleString("fr-FR")} caractères
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.warnings.length > 0 ? (
        <div className="alert warning">
          <strong>Points à vérifier :</strong>
          <ul>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="tools">
        <button type="button" className="btn ghost small" onClick={onAdjustSimple}>
          Ajuster dans Simple
        </button>
        <button type="button" className="btn ghost small" onClick={onExpert}>
          Passer en Expert
        </button>
      </div>
    </section>
  );
}
