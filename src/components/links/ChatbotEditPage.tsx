"use client";

import { useRouter } from "next/navigation";
import { ChatbotEditForm } from "./ChatbotEditForm";
import type { ChatbotFormOptions, ChatLinkRow } from "./types";

/** Page dédiée modification : même wizard que la création, en pleine page. */
export function ChatbotEditPage({
  link,
  options,
}: {
  link: ChatLinkRow;
  options: ChatbotFormOptions;
}) {
  const router = useRouter();
  const goBack = (): void => {
    router.push("/liens");
    router.refresh();
  };

  return (
    <section className="chatbot-config-page">
      <ChatbotEditForm
        link={link}
        confidentialites={options.confidentialites}
        visualTemplates={options.visualTemplates}
        aiProviders={options.aiProviders}
        canAssignAi={options.canAssignAi}
        onSaved={() => {
          router.push("/liens");
          router.refresh();
        }}
        onCancel={goBack}
      />
    </section>
  );
}
