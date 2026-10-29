import type { ChatbotDraft } from "@/application/ports/chatbot-draft-repository";
import type { ChatLinkListItem } from "@/application/use-cases/links/link-urls";
import type { WithCreatorLabel } from "@/application/use-cases/shared/creator-labels";
import type { ChatLink } from "@/domain/entities/chat";
import type { Prospect } from "@/domain/entities/prospect";
import type { TemplateParamSchema } from "@/domain/template-params";
import type { WidgetDisplay } from "@/domain/widget";

/** Lien exposé au client (jamais le hash du jeton). */
export type ChatLinkDto = ChatLink;
/** Ligne de la table : lien + URL partageable (null si legacy à migrer). */
export type ChatLinkRow = ChatLinkListItem;
export type ProspectOption = Pick<Prospect, "id" | "nom" | "prenom" | "email">;
/** Modèle proposé dans le sélecteur de création de lien. */
export type TemplateOption = { key: string; label: string };
/** Politique de confidentialité proposée au rattachement d'un lien. */
export type ConfidentialiteOption = { id: string; titre: string };
/** Fournisseur IA proposé dans le sélecteur d'un lien. */
export type AiProviderOption = {
  id: string;
  label: string;
  preset: string;
  defaultModel: string | null;
};
/** Template visuel + versions installées (rattachement d'un lien). */
export type VisualTemplateOption = {
  id: string;
  name: string;
  versions: {
    version: string;
    params: TemplateParamSchema[];
    widget: WidgetDisplay | null;
  }[];
};

export type CreatedLink = {
  link: ChatLinkDto;
  /** Jeton en clair : affiché à la demande (le chiffré est en base). */
  token: string;
  url: string;
  /** Snippet widget (si le lien a la surface widget). */
  widgetSnippet?: string;
  widgetEmbedUrl?: string;
};

/** Brouillon de création de chatbot exposé à la liste (jamais public). */
export type ChatbotDraftRow = WithCreatorLabel<ChatbotDraft>;
