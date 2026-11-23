"use client";

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { TemplateHost } from "@/components/templates/TemplateHost";
import { ToastProvider } from "@/components/ui/ToastProvider";
import type {
  TemplateContextPayload,
  TemplateMessage,
  TemplateSpec,
} from "@/domain/template-contract";
import "@/styles/tokens.css";
import "@/styles/motion.css";
import "@/styles/components.css";
import "@/styles/chat.css";

/**
 * Contrat de configuration injecté dans un build standalone.
 * Le build worker écrit ce JSON à côté de runtime.js.
 */
export type StandaloneRuntimeConfig = {
  version: 1;
  chatApiBaseUrl: string;
  token: string;
  template: TemplateSpec;
  context: TemplateContextPayload;
  conversationId: string | null;
  initialMessages: TemplateMessage[];
  anonymous: boolean;
};

declare global {
  interface Window {
    __ONIR_STANDALONE_CONFIG__?: StandaloneRuntimeConfig;
  }
}

const root = document.getElementById("onir-standalone-root");
const config = window.__ONIR_STANDALONE_CONFIG__;

if (root === null) {
  throw new Error("Conteneur standalone introuvable");
}
if (config === undefined) {
  throw new Error("Configuration standalone absente");
}
if (config.version !== 1) {
  throw new Error(`Version de configuration standalone non supportée : ${String(config.version)}`);
}

createRoot(root).render(
  createElement(
    ToastProvider,
    null,
    createElement(TemplateHost, {
      token: config.token,
      template: config.template,
      baseContext: config.context,
      conversationId: config.conversationId,
      initialMessages: config.initialMessages,
      anonymous: config.anonymous,
      platform: config.chatApiBaseUrl,
    }),
  ),
);
