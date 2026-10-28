import type { AttachmentView } from "@/domain/entities/attachment";
import type { ChatMessage } from "@/domain/entities/chat";
import { dashboardAttachmentUrl, signedAttachmentUrl } from "@/lib/attachment-token";

export type ChatAttachmentDto = AttachmentView & { url: string };

export type ChatMessageDto = Pick<
  ChatMessage,
  "id" | "role" | "content" | "medias" | "authorName" | "createdAt"
> & {
  attachments: ChatAttachmentDto[];
};

/** Message public : URL signée (le visiteur n'a pas de session). */
export function toPublicChatMessage(message: ChatMessage, organizationId: string): ChatMessageDto {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    medias: message.medias,
    authorName: null,
    createdAt: message.createdAt,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      url: signedAttachmentUrl(attachment.id, organizationId),
    })),
  };
}

/** Message dashboard : URL servie par la session de l'opérateur. */
export function toDashboardChatMessage(message: ChatMessage): ChatMessageDto {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    medias: message.medias,
    authorName: message.authorName,
    createdAt: message.createdAt,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      url: dashboardAttachmentUrl(attachment.id),
    })),
  };
}
