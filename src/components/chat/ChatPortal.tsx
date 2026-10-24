"use client";

import { useState } from "react";
import { ChatWindow } from "./ChatWindow";
import { ContactGate } from "./ContactGate";
import type { ChatMessageDto } from "./types";

/** Portail standard : identification (centrée) puis discussion plein écran. */
export function ChatPortal({
  token,
  confidentialite,
  anonymous = false,
}: {
  token: string;
  /** Politique de confidentialité à accepter (null = aucune). */
  confidentialite: { texte: string; lien: string } | null;
  /** Mode anonyme : aucun formulaire nom/contact. */
  anonymous?: boolean;
}) {
  const [started, setStarted] = useState<{
    conversationId: string;
    messages: ChatMessageDto[];
  } | null>(null);

  if (started === null) {
    if (anonymous && confidentialite === null) {
      return <ChatWindow conversationId={null} token={token} anonymous />;
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
    />
  );
}
