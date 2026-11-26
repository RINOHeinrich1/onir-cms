import { describe, expect, it } from "vitest";
import {
  appendTemplateEditMessage,
  createTemplateEditMessage,
  createTemplateEditSessionState,
  TEMPLATE_EDIT_MESSAGES_MAX,
} from "@/domain/template-edit-session";

describe("état de session d'édition", () => {
  it("démarre avec une fée et un brouillon", () => {
    const state = createTemplateEditSessionState({ pages: [] });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.role).toBe("assistant");
    expect(state.workingParams).toEqual({ pages: [] });
    expect(state.pendingProposal).toBeNull();
  });

  it("borne l'historique et les messages", () => {
    let state = createTemplateEditSessionState({});
    for (let index = 0; index < TEMPLATE_EDIT_MESSAGES_MAX + 10; index += 1) {
      state = appendTemplateEditMessage(
        state,
        createTemplateEditMessage("user", `message ${index}`),
      );
    }
    expect(state.messages).toHaveLength(TEMPLATE_EDIT_MESSAGES_MAX);
    expect(state.messages.at(-1)?.content.length).toBeLessThanOrEqual(2_000);
  });
});
