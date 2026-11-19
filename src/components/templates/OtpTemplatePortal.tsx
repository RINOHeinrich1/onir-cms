"use client";

import { useState } from "react";
import { OtpGate } from "@/components/chat/OtpGate";
import type { ChatMessageDto } from "@/components/chat/types";
import { TemplateHost } from "@/components/templates/TemplateHost";
import type { TemplateContextPayload, TemplateSpec } from "@/domain/template-contract";

export function OtpTemplatePortal({
  token,
  template,
  baseContext,
  confidentialite,
}: {
  token: string;
  template: TemplateSpec;
  baseContext: TemplateContextPayload;
  confidentialite: { texte: string; lien: string } | null;
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
    <TemplateHost
      token={token}
      template={template}
      baseContext={baseContext}
      conversationId={started.conversationId}
      initialMessages={started.messages.map((message) => ({
        id: message.id,
        role: message.role === "user" ? "user" : "assistant",
        content: message.content,
        medias: message.medias,
        ...(message.blocks === undefined ? {} : { blocks: message.blocks }),
        at: message.createdAt,
        ...(message.authorName === null ? {} : { authorName: message.authorName }),
      }))}
    />
  );
}
