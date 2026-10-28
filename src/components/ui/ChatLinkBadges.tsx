"use client";

import { useEffect, useState } from "react";
import { type ChatLinkOption, chatLinkScopeLabel, loadChatLinkOptions } from "./chat-link-options";

/**
 * Affiche la portée d'un élément : « Global » ou un badge par chatbot.
 * Les noms sont résolus depuis la liste des chatbots (jamais de clé technique).
 */
export function ChatLinkBadges({ ids }: { ids: string[] }) {
  const [options, setOptions] = useState<ChatLinkOption[]>([]);
  const [loading, setLoading] = useState(ids.length > 0);

  useEffect(() => {
    if (ids.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    loadChatLinkOptions()
      .then((loaded) => {
        if (!cancelled) setOptions(loaded);
      })
      .catch(() => {
        // Liste indisponible : libellés neutres ci-dessous.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ids.length]);

  const scope = chatLinkScopeLabel(ids, options);
  if (scope.global) {
    return <span className="badge muted">Global</span>;
  }
  return (
    <span className="key-chips">
      {ids.map((id, index) => (
        <span key={id} className="badge muted">
          {loading ? "…" : (scope.labels[index] ?? "Chatbot indisponible")}
        </span>
      ))}
    </span>
  );
}
