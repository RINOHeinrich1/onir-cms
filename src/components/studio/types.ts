import type { ChannelDraft } from "@/components/links/LinkChannelsFields";
import type { ChatLinkSurface, ChatLinkType } from "@/domain/entities/chat";

/** Lien exposé au studio de personnalisation. */
export type StudioLink = {
  id: string;
  label: string;
  type: ChatLinkType;
  url: string | null;
  activeSurface: ChatLinkSurface;
  page: ChannelDraft;
  widget: ChannelDraft;
};

export type StudioDevice = "desktop" | "tablet" | "mobile";

export type StudioTab = "all" | "content" | "colors" | "images" | "advanced";
