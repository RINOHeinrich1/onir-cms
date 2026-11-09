import type { SitePalette } from "@/domain/site-palette";
import type { TemplateParamSchema } from "@/domain/template-params";

export type ChatbotTemplateParamsPromptInput = {
  chatbot: {
    label: string;
    description: string;
    role: string;
    objective: string;
    tone: string;
    extraInstructions: string;
  };
  knowledge: Array<{ titre: string; contenu: string }>;
  conversation: Array<{ role: string; content: string }>;
  palette: SitePalette;
  params: TemplateParamSchema[];
};

const MAX_KNOWLEDGE_ITEMS = 12;
const MAX_KNOWLEDGE_CHARS = 2_000;

function fillableParams(params: TemplateParamSchema[]): TemplateParamSchema[] {
  return params
    .filter((param) => param.type !== "url" && param.type !== "image")
    .map((param) => ({
      key: param.key,
      label: param.label,
      description: param.description,
      type: param.type,
      default: param.default,
      ...(param.maxLength === undefined ? {} : { maxLength: param.maxLength }),
      ...(param.min === undefined ? {} : { min: param.min }),
      ...(param.max === undefined ? {} : { max: param.max }),
      ...(param.options === undefined ? {} : { options: param.options }),
    }));
}

/** Prompt du second appel : uniquement les paramètres statiques du widget. */
export function buildChatbotTemplateParamsPrompt(input: ChatbotTemplateParamsPromptInput): {
  system: string;
  user: string;
} {
  const system = [
    "Tu remplis les paramètres statiques d’un template visuel de widget ONIR CMS.",
    'Tu dois répondre uniquement avec un objet JSON de la forme {"params": { ... }}.',
    "Utilise strictement les clés fournies dans template_params.",
    "Déduis les valeurs du libellé, du type, de la description et des options du paramètre.",
    "Pour les titres et messages, appuie-toi sur la conversation et le brouillon généré.",
    "Ne génère ni image ni URL.",
    "Respecte les types, les options, les bornes min/max et maxLength.",
    "Pour les couleurs, utilise la palette du site lorsqu’elle est fournie et fiable.",
    "Si aucune couleur fiable n’est disponible, déduis les couleurs de la conversation du builder.",
    "N’utilise pas la description du site ni les connaissances comme source de couleurs.",
    "En cas de doute, renvoie la valeur default du paramètre.",
    "N’invente aucune clé, aucune URL, aucun fichier et aucune source de données.",
    "Ne touche pas aux données dynamiques : tu ne remplis que template_params.",
  ].join("\n");

  const user = JSON.stringify(
    {
      chatbot: input.chatbot,
      knowledge: input.knowledge.slice(0, MAX_KNOWLEDGE_ITEMS).map((item) => ({
        titre: item.titre,
        contenu: item.contenu.slice(0, MAX_KNOWLEDGE_CHARS),
      })),
      conversation: input.conversation.slice(-40).map((message) => ({
        role: message.role,
        content: message.content.slice(0, MAX_KNOWLEDGE_CHARS),
      })),
      site_palette: input.palette,
      template_params: fillableParams(input.params),
    },
    null,
    2,
  );

  return { system, user };
}
