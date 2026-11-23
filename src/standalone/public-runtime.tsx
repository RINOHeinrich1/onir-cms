"use client";

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { TemplateHost } from "@/components/templates/TemplateHost";
import { ToastProvider } from "@/components/ui/ToastProvider";
import type { StandaloneRuntimeConfig } from "@/domain/standalone";
import "@/styles/tokens.css";
import "@/styles/motion.css";
import "@/styles/components.css";
import "@/styles/chat.css";

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
