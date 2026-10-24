"use client";

import { useState } from "react";
import { ContactGate } from "@/components/chat/ContactGate";
import { TemplateHost } from "@/components/templates/TemplateHost";
import type { TemplateContextPayload, TemplateSpec } from "@/domain/template-contract";

/**
 * Portail anonyme pour un template visuel.
 * Avec politique : un consentement minimal est demandé avant le montage ; la
 * session est créée à ce moment. Sans politique : le host crée la session au
 * premier message.
 */
export function AnonymousTemplatePortal({
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
  const [conversationId, setConversationId] = useState<string | null>(null);

  if (confidentialite !== null && conversationId === null) {
    return (
      <div className="chat-gate">
        <ContactGate
          token={token}
          confidentialite={confidentialite}
          anonymous
          onStarted={(id) => setConversationId(id)}
        />
      </div>
    );
  }

  return (
    <TemplateHost
      token={token}
      template={template}
      baseContext={baseContext}
      conversationId={conversationId}
      initialMessages={[]}
      anonymous
    />
  );
}
