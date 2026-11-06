"use client";

import { Modal } from "@/components/ui/Modal";

function SparklesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l1.3 4.2L17.5 8.5l-4.2 1.3L12 14l-1.3-4.2L6.5 8.5l4.2-1.3L12 3z" />
      <path d="M18.5 14l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4z" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h7M15 7h5M4 17h5M13 17h7" />
      <circle cx="13" cy="7" r="2" />
      <circle cx="11" cy="17" r="2" />
    </svg>
  );
}

export function NewChatbotChoiceModal({
  onClose,
  onAi,
  onManual,
}: {
  onClose: () => void;
  onAi: () => void;
  onManual: () => void;
}) {
  return (
    <Modal
      title="Nouveau chatbot"
      onClose={onClose}
      dialogClassName="new-chatbot-choice-modal"
      bodyClassName="new-chatbot-choice-body"
    >
      <p className="new-chatbot-choice-intro">Comment souhaitez-vous créer votre chatbot ?</p>
      <div className="new-chatbot-choice-grid">
        <button type="button" className="new-chatbot-choice" onClick={onAi}>
          <span className="new-chatbot-choice-icon">
            <SparklesIcon />
          </span>
          <span>
            <strong>Créer avec l’IA</strong>
            <small>Décrivez votre besoin, l’IA prépare une première version.</small>
          </span>
        </button>
        <button type="button" className="new-chatbot-choice" onClick={onManual}>
          <span className="new-chatbot-choice-icon">
            <SlidersIcon />
          </span>
          <span>
            <strong>Créer manuellement</strong>
            <small>Configurer le chatbot étape par étape dans le wizard.</small>
          </span>
        </button>
      </div>
    </Modal>
  );
}
