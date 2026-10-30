"use client";

import {
  type ChatbotFallback,
  type ChatbotFallbackQuestion,
  MAX_FALLBACK_ANSWER_LENGTH,
  MAX_FALLBACK_INTRO_LENGTH,
  MAX_FALLBACK_QUESTION_LENGTH,
  MAX_FALLBACK_QUESTIONS,
} from "@/domain/entities/chatbot-config";

type Props = {
  value: ChatbotFallback;
  onChange: (value: ChatbotFallback) => void;
};

function newQuestionId(existing: readonly ChatbotFallbackQuestion[]): string {
  const used = new Set(existing.map((question) => question.id));
  let index = existing.length + 1;
  let id = `question-${index}`;
  while (used.has(id)) {
    index += 1;
    id = `question-${index}`;
  }
  return id;
}

function updateQuestion(
  value: ChatbotFallback,
  index: number,
  patch: Partial<ChatbotFallbackQuestion>,
): ChatbotFallback {
  return {
    ...value,
    questions: value.questions.map((question, current) =>
      current === index ? { ...question, ...patch } : question,
    ),
  };
}

function moveQuestion(value: ChatbotFallback, index: number, direction: -1 | 1): ChatbotFallback {
  const target = index + direction;
  if (target < 0 || target >= value.questions.length) return value;
  const questions = [...value.questions];
  const [entry] = questions.splice(index, 1);
  if (entry === undefined) return value;
  questions.splice(target, 0, entry);
  return { ...value, questions };
}

/**
 * Éditeur du secours heuristique (ADR-0059) : questions/réponses fermées et
 * accès à la fiche de collecte existante. Aucun mot-clé, aucun formulaire
 * parallèle.
 */
export function ChatbotFallbackFields({ value, onChange }: Props) {
  const canAdd = value.questions.length < MAX_FALLBACK_QUESTIONS;
  return (
    <div className="chatbot-fallback">
      <fieldset className="fieldset">
        <legend>Activation</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
          />
          Activer le secours heuristique quand l’IA est indisponible
        </label>
        <label className="field">
          Message d’introduction
          <textarea
            rows={2}
            maxLength={MAX_FALLBACK_INTRO_LENGTH}
            value={value.intro}
            onChange={(event) => onChange({ ...value, intro: event.target.value })}
          />
          <span className="hint">
            Affiché au-dessus du menu. {value.intro.length}/{MAX_FALLBACK_INTRO_LENGTH}
          </span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={value.showCollectionForm}
            onChange={(event) => onChange({ ...value, showCollectionForm: event.target.checked })}
          />
          Proposer « Remplir le formulaire » avec la fiche de collecte existante
        </label>
      </fieldset>

      <div className="chatbot-fiches-head">
        <strong>Questions/réponses ({value.questions.length})</strong>
        <button
          type="button"
          className="btn ghost small"
          disabled={!canAdd}
          onClick={() =>
            onChange({
              ...value,
              questions: [
                ...value.questions,
                { id: newQuestionId(value.questions), label: "", answer: "" },
              ],
            })
          }
        >
          Ajouter une question
        </button>
      </div>
      <p className="hint">
        Le visiteur choisit uniquement dans cette liste. Aucun mot-clé n’est interprété.
      </p>

      {value.questions.length === 0 ? (
        <p className="hint">Aucune question pour le moment.</p>
      ) : null}

      {value.questions.map((question, index) => (
        <div className="chatbot-fiche-card" key={question.id}>
          <div className="chatbot-fiche-head">
            <strong>Question {index + 1}</strong>
            <div className="tools">
              <button
                type="button"
                className="btn ghost small"
                aria-label="Monter"
                disabled={index === 0}
                onClick={() => onChange(moveQuestion(value, index, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn ghost small"
                aria-label="Descendre"
                disabled={index === value.questions.length - 1}
                onClick={() => onChange(moveQuestion(value, index, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={() =>
                  onChange({
                    ...value,
                    questions: value.questions.filter((_entry, current) => current !== index),
                  })
                }
              >
                Retirer
              </button>
            </div>
          </div>
          <label className="field">
            Libellé affiché *
            <input
              type="text"
              maxLength={MAX_FALLBACK_QUESTION_LENGTH}
              value={question.label}
              placeholder="Quels sont vos tarifs ?"
              onChange={(event) =>
                onChange(updateQuestion(value, index, { label: event.target.value }))
              }
            />
          </label>
          <label className="field">
            Réponse prédéfinie *
            <textarea
              rows={4}
              maxLength={MAX_FALLBACK_ANSWER_LENGTH}
              value={question.answer}
              placeholder="Nos tarifs démarrent à ..."
              onChange={(event) =>
                onChange(updateQuestion(value, index, { answer: event.target.value }))
              }
            />
            <span className="hint">
              {question.answer.length}/{MAX_FALLBACK_ANSWER_LENGTH}
            </span>
          </label>
        </div>
      ))}
    </div>
  );
}
