"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isUserState } from "@/domain/entities/user-state";
import type { TemplateCapability } from "@/domain/entities/visual-template";
import {
  parseTemplateAction,
  type TemplateAction,
  type TemplateContextPayload,
  type TemplateMessage,
  type TemplateSpec,
} from "@/domain/template-contract";
import type { TemplateDataResult } from "@/domain/template-data";

type TemplateIdentity = {
  nom: string;
  email: string;
  contacts?: { type: string; valeur: string }[];
  consentement?: boolean;
};

type TemplateActions = {
  submitIdentity(data: TemplateIdentity): void;
  sendMessage(content: string): void;
  finish(): void;
  request(capability: TemplateCapability): Promise<unknown>;
  openMedia(url: string): void;
  resize(height: number): void;
};

type TemplateDataApi = {
  load<T = unknown>(
    key: string,
    options?: { inputs?: Record<string, string | number | boolean> },
  ): Promise<TemplateDataResult<T>>;
};

type LiveContext = TemplateContextPayload & {
  actions: TemplateActions;
  data: TemplateDataApi;
  on(event: "state" | "resources" | "error", cb: (payload: unknown) => void): () => void;
};

/**
 * Shell hôte d'un template visuel (ADR-0019) : charge le bundle, injecte le
 * **contexte gelé** et **exécute les actions** (session, chat, média, fiche) côté
 * hôte. Le template n'accède jamais à l'API directement.
 */
export function TemplateHost({
  token,
  template,
  baseContext,
  conversationId: initialConversationId,
  initialMessages,
  platform = "/api/chat",
  preview = false,
}: {
  token: string;
  template: TemplateSpec;
  baseContext: TemplateContextPayload;
  conversationId: string | null;
  initialMessages: TemplateMessage[];
  /** Base des endpoints hôte (surchargée par le harness de dev). */
  platform?: string;
  /** Mode aperçu : les actions sont simulées localement (aucun appel API). */
  preview?: boolean;
}) {
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<TemplateMessage[]>(initialMessages);
  const [status, setStatus] = useState<"en_cours" | "finalisee">(baseContext.state.status);
  const [phase, setPhase] = useState<"identity" | "chat">(baseContext.state.phase);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(640);

  const listenersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());
  const mountRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const emit = useCallback((event: string, payload: unknown): void => {
    const set = listenersRef.current.get(event);
    if (set) for (const cb of set) cb(payload);
  }, []);

  const actions = useMemo<TemplateActions>(
    () => ({
      submitIdentity: (data) => {
        if (preview) {
          setPhase("chat");
          setMessages([
            {
              id: "preview-1",
              role: "assistant",
              content: `(aperçu) Bonjour ${data.nom}, parlez-moi de votre projet.`,
              medias: [],
              at: new Date().toISOString(),
            },
          ]);
          return;
        }
        void (async () => {
          try {
            const response = await fetch(`${platform}/session`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, ...data, loadedAt: Date.now() - 5000 }),
            });
            const json = (await response.json()) as {
              conversationId?: string;
              messages?: TemplateMessage[];
              error?: string;
            };
            if (!response.ok || typeof json.conversationId !== "string") {
              setError(json.error ?? "Démarrage impossible");
              return;
            }
            setConversationId(json.conversationId);
            setMessages(json.messages ?? []);
            setPhase("chat");
          } catch {
            setError("Erreur réseau, veuillez réessayer");
          }
        })();
      },
      sendMessage: (content) => {
        if (preview) {
          const at = new Date().toISOString();
          setMessages((prev) => [
            ...prev,
            { id: `u-${Date.now()}`, role: "user", content, medias: [], at },
          ]);
          setTyping(true);
          setTimeout(() => {
            setTyping(false);
            setMessages((prev) => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: "assistant",
                content: `(aperçu) Merci, noté : « ${content} ».`,
                medias: baseContext.resources.media.photos
                  .slice(0, 1)
                  .map((photo) => ({ type: "photo", libelle: photo.libelle, url: photo.url })),
                at: new Date().toISOString(),
              },
            ]);
          }, 500);
          return;
        }
        void (async () => {
          if (conversationId === null) return;
          const text = content.trim();
          if (text === "") return;
          setTyping(true);
          setError(null);
          const userId = `local-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: userId,
              role: "user",
              content: text,
              medias: [],
              at: new Date().toISOString(),
            },
          ]);
          // Capacité `userState` (ADR-0020) : l'HÔTE appelle /api/chat/state — le
          // template ne touche JAMAIS l'API. Double garde : capacité + flag lien.
          if (template.capabilities.includes("userState") && baseContext.link.userStateEnabled) {
            void (async () => {
              try {
                const stateResponse = await fetch(`${platform}/state`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ conversationId, content: text }),
                });
                if (!stateResponse.ok) return;
                const stateJson = (await stateResponse.json()) as {
                  state?: unknown;
                  confidence?: unknown;
                };
                const rawState = stateJson.state;
                if (!isUserState(rawState)) return;
                const confidence =
                  typeof stateJson.confidence === "number" ? stateJson.confidence : 0;
                setMessages((prev) =>
                  prev.map((entry) =>
                    entry.id === userId
                      ? { ...entry, userState: { label: rawState, confidence } }
                      : entry,
                  ),
                );
              } catch {
                // Fail-open : aucune réaction d'état si la détection échoue.
              }
            })();
          }
          try {
            const response = await fetch(platform, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conversationId, content: text }),
            });
            const json = (await response.json()) as {
              message?: TemplateMessage;
              mediaPending?: boolean;
              connaissances?: TemplateMessage["knowledge"];
              error?: string;
            };
            if (!response.ok || json.message === undefined) {
              setError(json.error ?? "Réponse impossible pour le moment");
              return;
            }
            // Capacité `knowledge` (ADR-0020) : connaissances réellement utilisées
            // (déjà gatées côté cœur par `sources.connaissances`).
            const answer: TemplateMessage =
              template.capabilities.includes("knowledge") && json.connaissances !== undefined
                ? { ...json.message, knowledge: json.connaissances }
                : json.message;
            setMessages((prev) => [...prev, answer]);
            if (json.mediaPending === true) {
              const media = await fetch(`${platform}/media`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversationId, messageId: answer.id }),
              }).catch(() => null);
              if (media?.ok === true) {
                const mediaJson = (await media.json()) as { medias?: TemplateMessage["medias"] };
                if (mediaJson.medias !== undefined) {
                  setMessages((prev) =>
                    prev.map((entry) =>
                      entry.id === answer.id ? { ...entry, medias: mediaJson.medias ?? [] } : entry,
                    ),
                  );
                }
              }
            }
          } catch {
            setError("Erreur réseau, veuillez réessayer");
          } finally {
            setTyping(false);
          }
        })();
      },
      finish: () => {
        if (preview) {
          setStatus("finalisee");
          return;
        }
        void (async () => {
          if (conversationId === null) return;
          try {
            const response = await fetch(`${platform}/finish`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conversationId }),
            });
            if (response.ok) setStatus("finalisee");
          } catch {
            setError("Génération impossible pour le moment");
          }
        })();
      },
      request: async (capability) => {
        if (capability === "media") return baseContext.resources.media;
        if (capability === "modelForm") return baseContext.resources.modelForm;
        if (capability === "theme") return baseContext.theme;
        return baseContext.state.messages;
      },
      openMedia: (url) => {
        window.open(url, "_blank", "noopener,noreferrer");
      },
      resize: (value) => {
        setHeight(Math.max(200, Math.min(value, 20000)));
      },
    }),
    [conversationId, platform, token, baseContext, preview, template],
  );

  const loadData = useCallback(
    async <T,>(
      key: string,
      options?: { inputs?: Record<string, string | number | boolean> },
    ): Promise<TemplateDataResult<T>> => {
      if (preview) {
        const eager = baseContext.resources.data?.[key];
        if (eager !== undefined) {
          return {
            status: "ok",
            data: eager as T,
            meta: {
              cached: true,
              generatedAt: new Date().toISOString(),
              revision: 0,
              truncated: false,
            },
          };
        }
        return {
          status: "error",
          code: "DATA_UNBOUND",
          message: "Aperçu : aucune donnée fournie pour cette ressource",
        };
      }
      try {
        const response = await fetch(`${platform}/data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, contract: key, inputs: options?.inputs }),
        });
        const json = (await response.json().catch(() => null)) as TemplateDataResult<T> | null;
        if (json !== null && (json.status === "ok" || json.status === "error")) return json;
        return { status: "error", code: "DATA_PROVIDER_ERROR", message: "Chargement impossible" };
      } catch {
        return { status: "error", code: "DATA_PROVIDER_ERROR", message: "Erreur réseau" };
      }
    },
    [baseContext.resources.data, platform, preview, token],
  );

  const liveContext = useMemo<LiveContext>(
    () => ({
      ...baseContext,
      state: { phase, status, messages, typing },
      actions,
      data: { load: loadData },
      on: (event, cb) => {
        const set = listenersRef.current.get(event) ?? new Set<(payload: unknown) => void>();
        set.add(cb);
        listenersRef.current.set(event, set);
        return () => set.delete(cb);
      },
    }),
    [baseContext, phase, status, messages, typing, actions, loadData],
  );

  const liveContextRef = useRef<LiveContext>(liveContext);

  const dispatchAction = useCallback(
    (action: TemplateAction): void => {
      switch (action.action) {
        case "ready":
          break;
        case "submitIdentity":
          actions.submitIdentity(action.payload);
          break;
        case "sendMessage":
          actions.sendMessage(action.payload.content);
          break;
        case "finish":
          actions.finish();
          break;
        case "openMedia":
          actions.openMedia(action.payload.url);
          break;
        case "resize":
          actions.resize(action.payload.height);
          break;
        case "request":
          void actions.request(action.payload.capability).then((value) => emit("resources", value));
          break;
      }
    },
    [actions, emit],
  );

  // Notifie les abonnés + met à jour l'élément à chaque changement de contexte.
  useEffect(() => {
    liveContextRef.current = liveContext;
    emit("state", liveContext.state);
    const el = elementRef.current;
    if (el !== null) {
      (el as HTMLElement & { onirtechContext?: LiveContext }).onirtechContext = liveContext;
    }
  }, [liveContext, emit]);

  // Transport Web Component : charge le bundle (SRI) et monte le Custom Element.
  useEffect(() => {
    if (template.mode !== "web-component" || template.element === null) return;
    const elementName = template.element;
    let cancelled = false;
    const attach = (): void => {
      if (cancelled) return;
      const el = document.createElement(elementName);
      elementRef.current = el;
      // Connecter l'élément AVANT d'injecter le contexte (le template se construit
      // dans connectedCallback ; injecter avant casse les templates à refs).
      mountRef.current?.replaceChildren(el);
      (el as HTMLElement & { onirtechContext?: LiveContext }).onirtechContext =
        liveContextRef.current;
    };
    if (customElements.get(elementName)) {
      attach();
    } else {
      const script = document.createElement("script");
      script.type = "module";
      script.src = template.entryUrl;
      script.onload = () => {
        void customElements.whenDefined(elementName).then(attach);
      };
      script.onerror = () => setError("Template indisponible");
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      elementRef.current = null;
    };
  }, [template.mode, template.element, template.entryUrl]);

  // Transport iframe : réception des actions + envoi du contexte.
  useEffect(() => {
    if (template.mode !== "iframe") return;
    const onMessage = (event: MessageEvent): void => {
      if (iframeRef.current === null || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (data === null || typeof data !== "object" || data.__onirtech !== 1) return;
      const parsed = parseTemplateAction(data);
      if (parsed.ok) dispatchAction(parsed.value);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [template.mode, dispatchAction]);

  useEffect(() => {
    if (template.mode !== "iframe") return;
    const context = { ...liveContext, actions: undefined, on: undefined, data: undefined };
    iframeRef.current?.contentWindow?.postMessage({ __onirtech: 1, type: "init", context }, "*");
  }, [template.mode, liveContext]);

  if (template.mode === "iframe") {
    return (
      <div className="template-host">
        {error !== null ? <p className="alert error">{error}</p> : null}
        <iframe
          ref={iframeRef}
          className="template-frame"
          title="Template de discussion"
          sandbox="allow-scripts allow-forms"
          src={template.entryUrl}
          style={{ width: "100%", height: `${height}px`, border: 0 }}
        />
      </div>
    );
  }

  return (
    <div className="template-host" ref={mountRef}>
      {error !== null ? <p className="alert error">{error}</p> : null}
    </div>
  );
}
