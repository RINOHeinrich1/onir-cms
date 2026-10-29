"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Lightbox, type LightboxImage } from "@/components/ui/Lightbox";
import type { ChatAttachmentDto, ChatMessageDto } from "./types";

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AttachmentList({ attachments }: { attachments: ChatAttachmentDto[] }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="chat-attachments">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="chat-attachment-item">
          <a
            className="chat-attachment-file"
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {attachment.originalName}
          </a>
          <span className="chat-attachment-label">{attachment.fieldLabel}</span>
        </li>
      ))}
    </ul>
  );
}

function AvatarIcon({ role }: { role: ChatMessageDto["role"] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {role === "user" ? (
        <>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </>
      ) : role === "operator" ? (
        <>
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <path d="M4 14h2v5H5a1 1 0 0 1-1-1zM20 14h-2v5h1a1 1 0 0 0 1-1z" />
          <path d="M12 21h1a2 2 0 0 0 2-2" />
        </>
      ) : (
        <>
          <path d="M12 3l1.4 4.2L17.5 9l-4.1 1.8L12 15l-1.4-4.2L6.5 9l4.1-1.8z" />
          <path d="M18.5 15l.7 2.1 2 .8-2 .8-.7 2-.7-2-2-.8 2-.8z" />
        </>
      )}
    </svg>
  );
}

function authorLabel(message: ChatMessageDto, assistantLabel: string): string {
  if (message.role === "user") return "Visiteur";
  if (message.role === "operator") {
    return message.authorName === null ? "Opérateur" : `Opérateur · ${message.authorName}`;
  }
  return assistantLabel;
}

/** Transcript en lecture seule d'une conversation (bulles + médias). */
export function ConversationTranscript({
  messages,
  assistantLabel,
}: {
  messages: ChatMessageDto[];
  assistantLabel: string;
}) {
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);

  if (messages.length === 0) {
    return <p className="muted-text">Aucun message dans cette conversation.</p>;
  }

  return (
    <>
      <ul className="chat-log-list transcript">
        {messages.map((message) => (
          <li key={message.id} className={`msg ${message.role}`}>
            <span className="msg-avatar transcript-avatar" aria-hidden="true">
              <AvatarIcon role={message.role} />
            </span>
            <div className="msg-body">
              <span className="msg-role">{authorLabel(message, assistantLabel)}</span>
              {message.role === "assistant" ? (
                <div className="bubble">
                  <div className="md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                  <AttachmentList attachments={message.attachments} />
                  {message.medias.length > 0 ? (
                    <ul className="chat-media">
                      {message.medias.map((media) =>
                        media.type === "photo" ? (
                          <li key={media.id} className="chat-media-item">
                            <button
                              type="button"
                              className="chat-media-zoom"
                              onClick={() =>
                                setLightbox({ url: media.url, libelle: media.libelle })
                              }
                              aria-label={`Agrandir : ${media.libelle}`}
                            >
                              {/* biome-ignore lint/performance/noImgElement: fichier servi par route (uuid) */}
                              <img
                                className="chat-media-photo"
                                src={media.url}
                                alt={media.libelle}
                                loading="lazy"
                              />
                            </button>
                          </li>
                        ) : (
                          <li key={media.id} className="chat-media-item">
                            <a
                              className="chat-media-lien"
                              href={media.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {media.libelle}
                            </a>
                          </li>
                        ),
                      )}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <div className="bubble">
                  {message.content !== "" ? <p>{message.content}</p> : null}
                  <AttachmentList attachments={message.attachments} />
                </div>
              )}
              <span className="msg-time">{formatDateTime(message.createdAt)}</span>
            </div>
          </li>
        ))}
      </ul>

      {lightbox !== null ? <Lightbox image={lightbox} onClose={() => setLightbox(null)} /> : null}
    </>
  );
}
