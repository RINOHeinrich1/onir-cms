import type { ChatbotBuildSession } from "@/domain/chatbot-builder";
import { BUILD_REQUIREMENT_LABELS } from "@/domain/chatbot-builder";

export type ChatbotBuilderPrompt = {
  system: string;
  user: string;
};

function history(session: ChatbotBuildSession): string {
  return session.messages
    .slice(-12)
    .map(
      (message) =>
        `${message.role === "assistant" ? "ASSISTANT" : "UTILISATEUR"} : ${message.content}`,
    )
    .join("\n");
}

function briefForPrompt(session: ChatbotBuildSession): string {
  const { brief } = session;
  return JSON.stringify(
    {
      description: brief.description,
      mission: brief.mission,
      collectionGoal: brief.collectionGoal,
      identity: brief.identity,
      sources: {
        websiteUrl: brief.sources.websiteUrl,
        documents: brief.sources.documents.map((document) => document.name),
        intent: brief.sources.intent,
        ficheTypes: brief.sources.ficheTypes,
        mediaTypes: brief.sources.mediaTypes,
      },
      behavior: brief.behavior,
      publication: brief.publication,
      limits: brief.limits,
    },
    null,
    2,
  );
}

export function buildChatbotBuilderPrompt(
  session: ChatbotBuildSession,
  userMessage: string,
): ChatbotBuilderPrompt {
  const missing = session.missingMandatory
    .map((requirement) => `- ${BUILD_REQUIREMENT_LABELS[requirement]} (${requirement})`)
    .join("\n");

  const system = `Tu es l'assistant de cadrage d'un chatbot ONIR CMS. Tu conduis une conversation naturelle pour recueillir les informations nécessaires à la génération d'un chatbot complet.

RÈGLES :
- Réponds uniquement avec un objet JSON valide, sans markdown autour, sans commentaire.
- Ton message \`reply\` doit être utile, court et naturel. Pose UNE SEULE question à la fois.
- Si des prérequis obligatoires manquent, pose la question sur le PREMIER prérequis manquant. Ne demande jamais un champ optionnel de ta propre initiative.
- Si l'utilisateur demande explicitement une personnalisation optionnelle (ton, langue, garde-fous, limites, canaux), tu peux la refléter dans \`patch\`.
- Ne demande pas le mode d'édition (guidé/expert) : ce n'est pas une donnée du chatbot.
- Ne choisis jamais les clés de fiches existantes (\`ficheTypes\`). Tu peux seulement exprimer une intention de source.
- Les documents sont joints séparément par l'interface ; tu ne les vois pas dans cette conversation.
- Ne prétends jamais que la génération est lancée. Le serveur décide quand les prérequis sont satisfaits.
- Les informations déjà présentes dans le brief sont acquises : ne les redemande pas, sauf ambiguïté réelle.
- Si l'utilisateur répond à côté, réponds brièvement puis reviens au prérequis manquant.
- Le brief peut évoluer : si l'utilisateur change d'avis, corrige les champs concernés.
- Une mission \`inform\` ne collecte rien et ne génère pas de fiche de collecte. Une mission \`collect\` n'utilise pas de source d'information. Une mission \`hybrid\` autorise les deux.
- Une source est obligatoire pour \`inform\` et \`hybrid\`. Un objectif de collecte est obligatoire pour \`collect\` et \`hybrid\`.
- Ne fabrique pas d'informations métier, de prix, de délais ou de coordonnées.

SCHÉMA JSON ATTENDU :
{
  "reply": "Message affiché à l'utilisateur, avec une seule question si nécessaire.",
  "suggestions": ["Réponse rapide proposée", "Autre réponse courte"],
  "patch": {
    "description": "Description du besoin, si précisée",
    "mission": "collect | inform | hybrid",
    "collectionGoal": "Ce que le chatbot doit collecter, si applicable",
    "identity": {
      "label": "Nom court du chatbot, si précisé",
      "role": "Rôle de l'assistant, si précisé",
      "objective": "Objectif de conversation, si précisé"
    },
    "sources": {
      "websiteUrl": "URL fournie par l'utilisateur, si applicable",
      "useDescriptionAsSource": true
    },
    "behavior": {
      "language": { "mode": "auto", "value": null },
      "tone": "Ton demandé, si applicable",
      "guardrails": ["Garde-fou demandé"],
      "extraInstructions": "Instruction supplémentaire demandée"
    }
  }
}

Le patch est optionnel. N'inclus que les champs réellement déduits du dernier message ou de l'historique. Une valeur inconnue doit être omise, jamais inventée.

PRÉREQUIS MANQUANTS :
${missing === "" ? "- Aucun" : missing}

BRIEF ACTUEL :
${briefForPrompt(session)}

HISTORIQUE RÉCENT :
${history(session) === "" ? "[Début de la conversation]" : history(session)}`;

  return {
    system,
    user: `Dernier message de l'utilisateur :\n${userMessage}\n\nRéponds avec le JSON attendu.`,
  };
}
