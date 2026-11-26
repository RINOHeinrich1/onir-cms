"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import type { TemplateParamValues } from "@/domain/template-params";

export type DisplayAssistantContext = {
  linkId: string;
  surface: "page" | "widget";
  selectedRegion: string | null;
  params: TemplateParamValues;
  canEdit: boolean;
  onApply: (values: TemplateParamValues) => void;
  onSave: () => Promise<void>;
};

type Registration = {
  context: DisplayAssistantContext | null;
  setContext: (context: DisplayAssistantContext | null) => void;
};

const DisplayAssistantRegistration = createContext<Registration | null>(null);

const noop = (): void => {};

export function DisplayAssistantProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<DisplayAssistantContext | null>(null);
  const value = useMemo(() => ({ context, setContext }), [context]);
  return (
    <DisplayAssistantRegistration.Provider value={value}>
      {children}
    </DisplayAssistantRegistration.Provider>
  );
}

export function useDisplayAssistantContext(): DisplayAssistantContext | null {
  return useContext(DisplayAssistantRegistration)?.context ?? null;
}

export function useDisplayAssistantRegistration(): (
  context: DisplayAssistantContext | null,
) => void {
  return useContext(DisplayAssistantRegistration)?.setContext ?? noop;
}
