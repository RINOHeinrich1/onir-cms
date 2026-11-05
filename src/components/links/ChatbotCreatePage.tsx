"use client";

import { useRouter } from "next/navigation";
import { LinkForm } from "./LinkForm";
import type { ChatbotDraftRow, ChatbotFormOptions } from "./types";

/** Page dédiée création / reprise : même wizard que la modale, en pleine page. */
export function ChatbotCreatePage({
  options,
  draft = null,
}: {
  options: ChatbotFormOptions;
  draft?: ChatbotDraftRow | null;
}) {
  const router = useRouter();
  const goBack = (): void => {
    router.push("/liens");
    router.refresh();
  };

  return (
    <section className="chatbot-config-page">
      <button type="button" className="chatbot-page-exit" onClick={goBack}>
        ← Chatbots
      </button>
      <LinkForm
        key={draft?.id ?? "nouveau"}
        layout="page"
        prospects={options.prospects}
        confidentialites={options.confidentialites}
        visualTemplates={options.visualTemplates}
        aiProviders={options.aiProviders}
        canAssignAi={options.canAssignAi}
        initialDraft={draft?.state ?? null}
        draftId={draft?.id ?? null}
        onCreated={() => {
          router.push("/liens");
          router.refresh();
        }}
        onCancel={goBack}
      />
    </section>
  );
}
