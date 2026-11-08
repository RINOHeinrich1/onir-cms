"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { ChatbotBuilderDialog } from "./ChatbotBuilderDialog";

type ChatbotBuilderContextValue = {
  openBuilder: () => void;
  builderOpen: boolean;
};

const ChatbotBuilderContext = createContext<ChatbotBuilderContextValue | null>(null);

export function useChatbotBuilder(): ChatbotBuilderContextValue {
  const value = useContext(ChatbotBuilderContext);
  if (value === null) {
    throw new Error("useChatbotBuilder doit être utilisé dans ChatbotBuilderProvider");
  }
  return value;
}

export function ChatbotBuilderProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ openBuilder: () => setOpen(true), builderOpen: open }), [open]);

  return (
    <ChatbotBuilderContext.Provider value={value}>
      {children}
      {open ? <ChatbotBuilderDialog open={open} onClose={() => setOpen(false)} /> : null}
    </ChatbotBuilderContext.Provider>
  );
}
