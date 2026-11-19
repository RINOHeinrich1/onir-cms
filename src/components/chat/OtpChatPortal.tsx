"use client";

import { useState } from "react";
import type { TemplateFormField } from "@/domain/template-contract";
import { ChatWindow } from "./ChatWindow";
import { OtpGate } from "./OtpGate";
import type { ChatMessageDto } from "./types";

export function OtpChatPortal({
  token,
  confidentialite,
  attachmentFields = [],
  canFinish = true,
}: {
  token: string;
  confidentialite: { texte: string; lien: string } | null;
  attachmentFields?: TemplateFormField[];
  canFinish?: boolean;
}) {
  const [started, setStarted] = useState<{
    conversationId: string;
    messages: ChatMessageDto[];
  } | null>(null);
  if (started === null) {
    return (
      <div className="chat-gate">
        <OtpGate
          token={token}
          confidentialite={confidentialite}
          onStarted={(conversationId, messages) => setStarted({ conversationId, messages })}
        />
      </div>
    );
  }
  return (
    <ChatWindow
      conversationId={started.conversationId}
      initialMessages={started.messages}
      attachmentFields={attachmentFields}
      canFinish={canFinish}
    />
  );
}
