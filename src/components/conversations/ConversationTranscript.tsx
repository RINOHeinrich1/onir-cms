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

/** Transcript en lecture seule d'une conversation (bulles + médias). */
export function ConversationTranscript({ messages }: { messages: ChatMessageDto[] }) {
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);

  if (messages.length === 0) {
    return <p className="muted-text">Aucun message dans cette conversation.</p>;
  }

  return (
    <>
      <ul className="chat-log-list transcript">
        {messages.map((message) => (
          <li key={message.id} className={`msg ${message.role}`}>
            <span className="msg-avatar" aria-hidden="true">
              {message.role === "user" ? "Visiteur" : "IA"}
            </span>
            <div className="msg-body">
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
