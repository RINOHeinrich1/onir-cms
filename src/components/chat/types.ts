import type {
  ChatAttachmentDto as AttachmentChatDto,
  ChatMessageDto as AttachmentChatMessageDto,
} from "@/application/use-cases/attachments/attachment-dto";

/** Message de chat exposé au client (public ou dashboard). */
export type ChatMessageDto = AttachmentChatMessageDto;
export type ChatAttachmentDto = AttachmentChatDto;
