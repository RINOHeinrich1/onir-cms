import { BrandLogo } from "@/components/layout/BrandLogo";
import { WidgetReadySignal } from "@/components/templates/WidgetReadySignal";
import type { ChatLinkBlockReason } from "@/domain/entities/chat";

const COPY: Record<ChatLinkBlockReason, { title: string; body: string }> = {
  fiches: {
    title: "Ce chatbot a atteint sa limite de fiches",
    body: "Il ne prend plus de nouvelles conversations pour le moment. L’équipe peut augmenter sa limite depuis l’administration.",
  },
  tokens: {
    title: "Ce chatbot a atteint son budget de tokens",
    body: "Le budget de réponses IA est épuisé. Le chatbot reprendra après réinitialisation par l’équipe.",
  },
};

/** Page publique de blocage d'un chatbot ayant atteint un quota (ADR-0048). */
export function ChatbotUnavailable({
  reason,
  surface = "page",
}: {
  reason: ChatLinkBlockReason;
  surface?: "page" | "widget";
}) {
  const copy = COPY[reason];
  return (
    <main className={surface === "widget" ? "widget-page" : "chat-page"}>
      {surface === "widget" ? <WidgetReadySignal /> : null}
      {surface === "page" ? (
        <header className="chat-page-header">
          <span className="brand brand-logo">
            <BrandLogo />
          </span>
          <div className="chat-heading">
            <h1 className="chat-page-title">Discussion</h1>
            <span className="chat-status">
              <span className="chat-status-dot" aria-hidden="true" />
              Assistant indisponible
            </span>
          </div>
        </header>
      ) : null}
      <div className="chat-gate">
        <section className="card" aria-live="polite">
          <h2>{copy.title}</h2>
          <p className="hint">{copy.body}</p>
        </section>
      </div>
    </main>
  );
}
