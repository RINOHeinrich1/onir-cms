import type {
  ChatbotBuildSessionRepository,
  StoredChatbotBuildSession,
} from "@/application/ports/chatbot-build-session-repository";
import type { ChatbotDraftRepository } from "@/application/ports/chatbot-draft-repository";
import {
  buildSessionFromState,
  type ChatbotBuildSession,
  isBuilderDraftState,
  serializeBuildSession,
} from "@/domain/chatbot-builder";

const DEFAULT_LABEL = "Nouveau chatbot IA";

function labelFor(session: ChatbotBuildSession): string {
  return session.brief.identity.label?.trim() || DEFAULT_LABEL;
}

/** Session builder stockée dans `chatbot_drafts.state.builder` (ADR-0069). */
export function chatbotBuildSessionRepository(
  drafts: ChatbotDraftRepository,
): ChatbotBuildSessionRepository {
  return {
    async create(organizationId, createdBy, session): Promise<StoredChatbotBuildSession> {
      const draft = await drafts.create(organizationId, {
        label: labelFor(session),
        state: serializeBuildSession(session),
        createdBy,
      });
      return {
        draftId: draft.id,
        session: { ...session, id: draft.id },
      };
    },

    async find(organizationId, draftId): Promise<StoredChatbotBuildSession | null> {
      const draft = await drafts.findById(organizationId, draftId);
      if (draft === null || !isBuilderDraftState(draft.state)) return null;
      const session = buildSessionFromState(draft.state, draft.id);
      return session === null ? null : { draftId: draft.id, session };
    },

    async save(organizationId, draftId, session): Promise<StoredChatbotBuildSession | null> {
      const draft = await drafts.update(organizationId, draftId, {
        label: labelFor(session),
        state: serializeBuildSession(session),
      });
      return draft === null ? null : { draftId: draft.id, session: { ...session, id: draft.id } };
    },

    async delete(organizationId, draftId): Promise<boolean> {
      const draft = await drafts.findById(organizationId, draftId);
      if (draft === null || !isBuilderDraftState(draft.state)) return false;
      return drafts.delete(organizationId, draftId);
    },
  };
}
