"use client";

import { useState } from "react";
import type { TemplateFormField } from "@/domain/template-contract";
import { ChatWindow } from "./ChatWindow";
import { ContactGate } from "./ContactGate";
import type { ChatMessageDto } from "./types";

/** Portail standard : identification (centrée) puis discussion plein écran. */
export function ChatPortal({
  token,
  confidentialite,
  anonymous = false,
  attachmentFields = [],
  canFinish = true,
}: {
  token: string;
  /** Politique de confidentialité à accepter (null = aucune). */
  confidentialite: { texte: string; lien: string } | null;
  /** Mode anonyme : aucun formulaire nom/contact. */
  anonymous?: boolean;
  /** Champs fichier du modèle de raisonnement (ADR-0034). */
  attachmentFields?: TemplateFormField[];
  /** Faux pour un chatbot de présentation sans fiche de collecte. */
  canFinish?: boolean;
}) {
  const [started, setStarted] = useState<{
    conversationId: string;
    messages: ChatMessageDto[];
  } | null>(null);

  if (started === null) {
    if (anonymous && confidentialite === null) {
      return (
        <ChatWindow
          conversationId={null}
          token={token}
          anonymous
          attachmentFields={attachmentFields}
          canFinish={canFinish}
        />
      );
    }
    return (
      <div className="chat-gate">
        <ContactGate
          token={token}
          confidentialite={confidentialite}
          anonymous={anonymous}
          onStarted={(conversationId, messages) => setStarted({ conversationId, messages })}
        />
      </div>
    );
  }
  return (
    <ChatWindow
      conversationId={started.conversationId}
      initialMessages={started.messages}
      anonymous={anonymous}
      attachmentFields={attachmentFields}
      canFinish={canFinish}
    />
  );
}
