import type { TemplateEditProposal } from "@/domain/template-edit-proposal";
import type { TemplateEditCandidate } from "@/domain/template-edit-target";
import type { TemplateParamValues } from "@/domain/template-params";

export type TemplateEditMessageRole = "user" | "assistant";

export type TemplateEditChatMessage = {
  id: string;
  role: TemplateEditMessageRole;
  content: string;
  createdAt: string;
  proposal?: TemplateEditProposal;
  candidate?: TemplateEditCandidate;
  candidates?: TemplateEditCandidate[];
  appliedAt?: string;
};

export type TemplateEditSessionState = {
  messages: TemplateEditChatMessage[];
  workingParams: TemplateParamValues;
  selection: string | null;
  pendingProposal: TemplateEditProposal | null;
  pendingValues?: TemplateParamValues | null;
  pendingCandidate: TemplateEditCandidate | null;
  pendingBaseHash?: string | null;
  suggestions: string[];
};

export type TemplateEditSession = {
  id: string;
  organizationId: string;
  linkId: string;
  createdBy: string | null;
  surface: "page" | "widget";
  templateId: string | null;
  templateVersion: string | null;
  status: "active" | "archived";
  state: TemplateEditSessionState;
  createdAt: string;
  updatedAt: string;
};

export const TEMPLATE_EDIT_MESSAGE_MAX = 2_000;
export const TEMPLATE_EDIT_MESSAGES_MAX = 60;

export function createTemplateEditSessionState(
  workingParams: TemplateParamValues,
): TemplateEditSessionState {
  return {
    messages: [
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Bonjour, je suis la fée ONIRIA. Je peux modifier cet écran avec vous. Que souhaitez-vous changer ?",
        createdAt: new Date().toISOString(),
      },
    ],
    workingParams,
    selection: null,
    pendingProposal: null,
    pendingValues: null,
    pendingCandidate: null,
    pendingBaseHash: null,
    suggestions: ["Changer une couleur", "Supprimer un bloc", "Modifier le texte d’un bouton"],
  };
}

export function appendTemplateEditMessage(
  state: TemplateEditSessionState,
  message: TemplateEditChatMessage,
): TemplateEditSessionState {
  return {
    ...state,
    messages: [...state.messages, message].slice(-TEMPLATE_EDIT_MESSAGES_MAX),
  };
}

export function createTemplateEditMessage(
  role: TemplateEditMessageRole,
  content: string,
  extra: Omit<TemplateEditChatMessage, "id" | "role" | "content" | "createdAt"> = {},
): TemplateEditChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content: content.slice(0, TEMPLATE_EDIT_MESSAGE_MAX),
    createdAt: new Date().toISOString(),
    ...extra,
  };
}
