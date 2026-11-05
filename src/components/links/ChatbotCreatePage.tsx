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
      <div className="page-head">
        <div>
          <span className="eyebrow">Chatbots</span>
          <h1 className="text-title">
            {draft === null ? "Nouveau chatbot" : "Reprendre un brouillon"}
          </h1>
        </div>
        <button type="button" className="btn ghost small" onClick={goBack}>
          Retour aux chatbots
        </button>
      </div>
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
