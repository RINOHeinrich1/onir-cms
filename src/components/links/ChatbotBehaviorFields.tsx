"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { HelpHint } from "@/components/ui/HelpHint";
import {
  MAX_CHATBOT_REPLY_MAX_TOKENS,
  MIN_CHATBOT_REPLY_MAX_TOKENS,
} from "@/domain/entities/chatbot-config";
import { type ChatbotConfigDraft, guidedPromptFromDraft } from "./chatbot-config-draft";

type Props = {
  value: ChatbotConfigDraft;
  onChange: (value: ChatbotConfigDraft) => void;
};

function newGuardrailKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `guardrail-${Math.random().toString(36).slice(2)}`;
}

/** Réglages guidés (6 champs) ou prompt expert, source unique du comportement. */
export function ChatbotBehaviorFields({ value, onChange }: Props) {
  const simple = value.simple;
  const guidedPrompt = guidedPromptFromDraft(value);
  const guardrailRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [guardrailKeys, setGuardrailKeys] = useState<string[]>(() =>
    simple.guardrails.map(() => newGuardrailKey()),
  );

  useEffect(() => {
    if (focusIndex === null) return;
    const frame = requestAnimationFrame(() => {
      guardrailRefs.current[focusIndex]?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusIndex]);

  useEffect(() => {
    setGuardrailKeys((current) =>
      current.length === simple.guardrails.length
        ? current
        : simple.guardrails.map((_entry, index) => current[index] ?? newGuardrailKey()),
    );
  }, [simple.guardrails]);

  const setSimple = (patch: Partial<ChatbotConfigDraft["simple"]>): void => {
    onChange({ ...value, simple: { ...simple, ...patch } });
  };

  const switchMode = async (mode: ChatbotConfigDraft["behaviorMode"]): Promise<void> => {
    if (mode === value.behaviorMode) return;
    if (mode === "guided" && value.behaviorMode === "expert") {
      const confirmed = await confirmDialog(
        "Le prompt personnalisé sera remplacé par le prompt généré depuis les réglages guidés.",
        {
          title: "Passer en mode guidé ?",
          confirmLabel: "Passer en guidé",
          cancelLabel: "Garder le prompt expert",
          danger: true,
        },
      );
      if (!confirmed) return;
      onChange({ ...value, behaviorMode: "guided" });
      return;
    }
    onChange({
      ...value,
      behaviorMode: "expert",
      systemPrompt: guidedPromptFromDraft(value),
    });
  };

  const addGuardrail = (): void => {
    const next = [...simple.guardrails, ""];
    setGuardrailKeys((current) => [...current, newGuardrailKey()]);
    setSimple({ guardrails: next });
    setFocusIndex(next.length - 1);
  };

  const updateGuardrail = (index: number, text: string): void => {
    setSimple({
      guardrails: simple.guardrails.map((entry, current) => (current === index ? text : entry)),
    });
  };

  const removeGuardrail = (index: number): void => {
    setGuardrailKeys((current) => current.filter((_entry, current) => current !== index));
    setSimple({
      guardrails: simple.guardrails.filter((_entry, current) => current !== index),
    });
  };

  const renderSimpleFields = (): ReactNode => (
    <>
      <label className="field">
        Rôle
        <input
          type="text"
          value={simple.role}
          maxLength={200}
          onChange={(event) => setSimple({ role: event.target.value })}
        />
      </label>
      <label className="field">
        Objectif
        <textarea
          rows={2}
          value={simple.objective}
          maxLength={2000}
          onChange={(event) => setSimple({ objective: event.target.value })}
        />
      </label>
      <label className="field">
        Langue
        <select
          value={simple.languageMode}
          onChange={(event) =>
            setSimple({ languageMode: event.target.value === "fixed" ? "fixed" : "auto" })
          }
        >
          <option value="auto">Automatique (langue du visiteur)</option>
          <option value="fixed">Langue fixe</option>
        </select>
      </label>
      {simple.languageMode === "fixed" ? (
        <label className="field">
          Langue imposée
          <input
            type="text"
            value={simple.languageValue}
            placeholder="Ex. français"
            onChange={(event) => setSimple({ languageValue: event.target.value })}
          />
        </label>
      ) : null}
      <label className="field">
        Ton
        <input
          type="text"
          value={simple.tone}
          maxLength={200}
          onChange={(event) => setSimple({ tone: event.target.value })}
        />
      </label>
      <div className="guardrail-editor">
        <span className="label">Garde-fous</span>
        <span className="hint">Aucun n’est activé par défaut.</span>
        {simple.guardrails.map((guardrail, index) => (
          <div className="guardrail-row" key={guardrailKeys[index] ?? `guardrail-${index}`}>
            <input
              ref={(element) => {
                guardrailRefs.current[index] = element;
              }}
              type="text"
              value={guardrail}
              maxLength={500}
              placeholder="Ex. Ne jamais promettre de prix ni de délai"
              onChange={(event) => updateGuardrail(index, event.target.value)}
            />
            <button
              type="button"
              className="btn danger ghost small"
              onClick={() => removeGuardrail(index)}
            >
              Retirer
            </button>
          </div>
        ))}
        <button type="button" className="btn ghost small" onClick={addGuardrail}>
          Ajouter un garde-fou
        </button>
      </div>
      <label className="field">
        Instructions complémentaires
        <textarea
          rows={2}
          value={simple.extraInstructions}
          maxLength={4000}
          onChange={(event) => setSimple({ extraInstructions: event.target.value })}
        />
      </label>
    </>
  );

  return (
    <div className="chatbot-behavior">
      <div className="chatbot-card-head">
        <div>
          <h2>Comportement</h2>
          <p className="hint">Le ton, les limites et le prompt du chatbot.</p>
        </div>
      </div>
      <fieldset className="fieldset">
        <legend>Mode de comportement</legend>
        <div className="template-mode-switch">
          <button
            type="button"
            className={`btn ghost small${value.behaviorMode === "guided" ? " active" : ""}`}
            aria-pressed={value.behaviorMode === "guided"}
            onClick={() => void switchMode("guided")}
          >
            Guidé
          </button>
          <button
            type="button"
            className={`btn ghost small${value.behaviorMode === "expert" ? " active" : ""}`}
            aria-pressed={value.behaviorMode === "expert"}
            onClick={() => void switchMode("expert")}
          >
            Expert
          </button>
        </div>
        <HelpHint label="Aide sur le mode de comportement">
          {value.behaviorMode === "guided"
            ? "Le prompt est généré depuis les réglages simples. Il n’est pas éditable."
            : "Le prompt système est la source du comportement. Les réglages simples sont conservés mais ne sont pas ajoutés au prompt."}
        </HelpHint>
      </fieldset>

      <label className="field">
        Longueur maximale des réponses
        <input
          type="number"
          min={MIN_CHATBOT_REPLY_MAX_TOKENS}
          max={MAX_CHATBOT_REPLY_MAX_TOKENS}
          step={50}
          value={value.replyMaxTokens}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isFinite(next)) return;
            onChange({
              ...value,
              replyMaxTokens: Math.max(
                MIN_CHATBOT_REPLY_MAX_TOKENS,
                Math.min(MAX_CHATBOT_REPLY_MAX_TOKENS, Math.round(next)),
              ),
            });
          }}
        />
        <HelpHint label="Aide sur la longueur maximale">
          Budget de cette réponse, en tokens (≈ {Math.round(value.replyMaxTokens * 0.6)} mots).
          Différent du budget total de tokens du chatbot.
        </HelpHint>
      </label>

      {value.behaviorMode === "guided" ? (
        <>
          <fieldset className="fieldset">
            <legend>Réglages guidés</legend>
            {renderSimpleFields()}
          </fieldset>
          <details className="prompt-preview-block">
            <summary>Voir le prompt généré</summary>
            <pre className="prompt-preview">{guidedPrompt === "" ? "—" : guidedPrompt}</pre>
          </details>
        </>
      ) : (
        <>
          <label className="field">
            Prompt système *
            <textarea
              rows={8}
              value={value.systemPrompt}
              onChange={(event) => onChange({ ...value, systemPrompt: event.target.value })}
              placeholder="Rôle, ton, règles de conversation, informations à ne pas divulguer…"
            />
            <span className="hint">
              Le mode expert n’ajoute pas les réglages simples au prompt.
            </span>
          </label>
          <details className="prompt-preview-block">
            <summary>Réglages simples (conservés, non appliqués en mode expert)</summary>
            <div className="prompt-simple-settings">{renderSimpleFields()}</div>
          </details>
        </>
      )}
    </div>
  );
}
