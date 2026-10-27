"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { isUserState } from "@/domain/entities/user-state";
import type { TemplateCapability } from "@/domain/entities/visual-template";
import {
  parseTemplateAction,
  type TemplateAction,
  type TemplateAttachment,
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
  sendMessage(content: string, attachmentIds?: string[]): void;
  attachFile(fieldName: string, file: File): Promise<void>;
  removeAttachment(attachmentId: string): Promise<void>;
  finish(): void;
  request(capability: TemplateCapability): Promise<unknown>;
  openMedia(url: string): void;
  resize(height: number): void;
  openWidget(options?: { width?: number; height?: number }): void;
  closeWidget(): void;
};

type TemplateDataApi = {
  load<T = unknown>(
    key: string,
    options?: { inputs?: Record<string, string | number | boolean> },
  ): Promise<TemplateDataResult<T>>;
};

type HostApiMessage = TemplateMessage & { createdAt?: string };

/** Les endpoints chat renvoient `createdAt` ; le contrat template attend `at`. */
function withAt(message: HostApiMessage, allowAttachments: boolean): TemplateMessage {
  const normalized = {
    ...message,
    at: message.at ?? message.createdAt ?? new Date().toISOString(),
  };
  if (allowAttachments) return normalized;
  const { attachments: _attachments, ...withoutAttachments } = normalized;
  return withoutAttachments;
}

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
  anonymous = false,
  platform = "/api/chat",
  preview = false,
}: {
  token: string;
  template: TemplateSpec;
  baseContext: TemplateContextPayload;
  conversationId: string | null;
  initialMessages: TemplateMessage[];
  /** Mode anonyme : démarrage direct en chat, session créée au premier message. */
  anonymous?: boolean;
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
  useToastOnMessage(error);
  const [height, setHeight] = useState(640);
  const [pendingAttachments, setPendingAttachments] = useState<TemplateAttachment[]>([]);
  const surface = baseContext.surface;

  const conversationRef = useRef<string | null>(initialConversationId);
  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);
  const listenersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());
  const mountRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const postWidget = useCallback(
    (message: { type: "open"; width?: number; height?: number } | { type: "close" }): void => {
      if (surface !== "widget" || typeof window === "undefined" || window.parent === window) return;
      window.parent.postMessage({ __onirWidget: 1, ...message }, "*");
    },
    [surface],
  );

  const emit = useCallback((event: string, payload: unknown): void => {
    const set = listenersRef.current.get(event);
    if (set) for (const cb of set) cb(payload);
  }, []);

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (conversationRef.current !== null) return conversationRef.current;
    if (!anonymous) return null;
    if (sessionPromiseRef.current !== null) return sessionPromiseRef.current;
    const promise = (async () => {
      const response = await fetch(`${platform}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, loadedAt: Date.now() - 5000, surface }),
      }).catch(() => null);
      const json = (await response?.json().catch(() => null)) as {
        conversationId?: string;
        messages?: TemplateMessage[];
        error?: string;
      } | null;
      if (response?.ok !== true || typeof json?.conversationId !== "string") {
        setError(json?.error ?? "Démarrage de la discussion impossible");
        return null;
      }
      conversationRef.current = json.conversationId;
      setConversationId(json.conversationId);
      if (json.messages !== undefined && json.messages.length > 0) {
        setMessages(
          json.messages.map((message) =>
            withAt(message, template.capabilities.includes("attachments")),
          ),
        );
      }
      return json.conversationId;
    })();
    sessionPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      sessionPromiseRef.current = null;
    }
  }, [anonymous, platform, surface, template, token]);

  const uploadAttachment = useCallback(
    async (fieldName: string, file: File): Promise<void> => {
      if (preview || !template.capabilities.includes("attachments")) return;
      const activeConversationId = await ensureConversation();
      if (activeConversationId === null) return;
      const form = new FormData();
      form.append("conversationId", activeConversationId);
      form.append("fieldName", fieldName);
      form.append("fichier", file);
      try {
        const response = await fetch(`${platform}/attachments`, {
          method: "POST",
          body: form,
        });
        const json = (await response.json()) as {
          attachment?: TemplateAttachment;
          error?: string;
        };
        if (!response.ok || json.attachment === undefined) {
          setError(json.error ?? "Envoi du fichier impossible");
          return;
        }
        setPendingAttachments((previous) => [...previous, json.attachment as TemplateAttachment]);
      } catch {
        setError("Erreur réseau pendant l'envoi du fichier");
      }
    },
    [ensureConversation, platform, preview, template],
  );

  const removeAttachment = useCallback(
    async (attachmentId: string): Promise<void> => {
      if (!template.capabilities.includes("attachments")) return;
      setPendingAttachments((previous) =>
        previous.filter((attachment) => attachment.id !== attachmentId),
      );
      if (preview) return;
      const activeConversationId = await ensureConversation();
      if (activeConversationId === null) return;
      await fetch(
        `${platform}/attachments/${attachmentId}?conversationId=${encodeURIComponent(
          activeConversationId,
        )}`,
        { method: "DELETE" },
      ).catch(() => undefined);
    },
    [ensureConversation, platform, preview, template],
  );

  const actions = useMemo<TemplateActions>(
    () => ({
      submitIdentity: (data) => {
        if (anonymous || surface === "widget") return;
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
              messages?: HostApiMessage[];
              error?: string;
            };
            if (!response.ok || typeof json.conversationId !== "string") {
              setError(json.error ?? "Démarrage impossible");
              return;
            }
            conversationRef.current = json.conversationId;
            setConversationId(json.conversationId);
            setMessages(
              (json.messages ?? []).map((message) =>
                withAt(message, template.capabilities.includes("attachments")),
              ),
            );
            setPhase("chat");
          } catch {
            setError("Erreur réseau, veuillez réessayer");
          }
        })();
      },
      sendMessage: (content, requestedIds) => {
        const text = content.trim();
        const attachments =
          requestedIds === undefined || requestedIds.length === 0
            ? pendingAttachments
            : pendingAttachments.filter((attachment) => requestedIds.includes(attachment.id));
        if (text === "" && attachments.length === 0) return;
        if (preview) {
          const at = new Date().toISOString();
          setMessages((prev) => [
            ...prev,
            { id: `u-${Date.now()}`, role: "user", content: text, medias: [], attachments, at },
          ]);
          setTyping(true);
          setTimeout(() => {
            setTyping(false);
            setMessages((prev) => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: "assistant",
                content: `(aperçu) Merci, noté : « ${text} ».`,
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
          setError(null);
          const activeConversationId = await ensureConversation();
          if (activeConversationId === null) return;
          const userId = `local-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: userId,
              role: "user",
              content: text,
              medias: [],
              attachments,
              at: new Date().toISOString(),
            },
          ]);
          const removeLocal = (): void => {
            setMessages((previous) => previous.filter((message) => message.id !== userId));
          };
          if (text !== "") setTyping(true);
          // Capacité `userState` (ADR-0020) : l'HÔTE appelle /api/chat/state — le
          // template ne touche JAMAIS l'API. Double garde : capacité + flag lien.
          if (
            text !== "" &&
            template.capabilities.includes("userState") &&
            baseContext.link.userStateEnabled
          ) {
            void (async () => {
              try {
                const stateResponse = await fetch(`${platform}/state`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ conversationId: activeConversationId, content: text }),
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
              body: JSON.stringify({
                conversationId: activeConversationId,
                content: text,
                attachmentIds: attachments.map((attachment) => attachment.id),
              }),
            });
            const json = (await response.json()) as {
              message?: HostApiMessage | null;
              mediaPending?: boolean;
              connaissances?: TemplateMessage["knowledge"];
              error?: string;
            };
            if (!response.ok) {
              removeLocal();
              setError(json.error ?? "Réponse impossible pour le moment");
              return;
            }
            setPendingAttachments([]);
            const answer =
              json.message === undefined || json.message === null
                ? null
                : template.capabilities.includes("knowledge") && json.connaissances !== undefined
                  ? {
                      ...withAt(json.message, template.capabilities.includes("attachments")),
                      knowledge: json.connaissances,
                    }
                  : withAt(json.message, template.capabilities.includes("attachments"));
            if (answer !== null) {
              setMessages((prev) => [...prev, answer]);
              if (json.mediaPending === true) {
                const media = await fetch(`${platform}/media`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    conversationId: activeConversationId,
                    messageId: answer.id,
                  }),
                }).catch(() => null);
                if (media?.ok === true) {
                  const mediaJson = (await media.json()) as { medias?: TemplateMessage["medias"] };
                  if (mediaJson.medias !== undefined) {
                    setMessages((prev) =>
                      prev.map((entry) =>
                        entry.id === answer.id
                          ? { ...entry, medias: mediaJson.medias ?? [] }
                          : entry,
                      ),
                    );
                  }
                }
              }
            }
          } catch {
            removeLocal();
            setError("Erreur réseau, veuillez réessayer");
          } finally {
            setTyping(false);
          }
        })();
      },
      attachFile: uploadAttachment,
      removeAttachment,
      finish: () => {
        if (anonymous && surface !== "widget") {
          setStatus("finalisee");
          return;
        }
        if (preview) {
          setStatus("finalisee");
          return;
        }
        void (async () => {
          const activeConversationId = conversationId ?? (await ensureConversation());
          if (activeConversationId === null) return;
          try {
            const response = await fetch(`${platform}/finish`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conversationId: activeConversationId }),
            });
            const json = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (!response.ok) {
              setError(json?.error ?? "Génération impossible : pièces ou champs manquants");
              return;
            }
            setStatus("finalisee");
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
      openWidget: (options) => {
        postWidget({ type: "open", ...(options ?? {}) });
      },
      closeWidget: () => {
        postWidget({ type: "close" });
      },
    }),
    [
      anonymous,
      baseContext,
      ensureConversation,
      pendingAttachments,
      platform,
      preview,
      template,
      uploadAttachment,
      removeAttachment,
      conversationId,
      postWidget,
      token,
      surface,
    ],
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
          body: JSON.stringify({ token, contract: key, inputs: options?.inputs, surface }),
        });
        const json = (await response.json().catch(() => null)) as TemplateDataResult<T> | null;
        if (json !== null && (json.status === "ok" || json.status === "error")) return json;
        return { status: "error", code: "DATA_PROVIDER_ERROR", message: "Chargement impossible" };
      } catch {
        return { status: "error", code: "DATA_PROVIDER_ERROR", message: "Erreur réseau" };
      }
    },
    [baseContext.resources.data, platform, preview, surface, token],
  );

  const liveContext = useMemo<LiveContext>(
    () => ({
      ...baseContext,
      state: {
        phase,
        status,
        messages,
        typing,
        ...(template.capabilities.includes("attachments") ? { pendingAttachments } : {}),
      },
      actions,
      data: { load: loadData },
      on: (event, cb) => {
        const set = listenersRef.current.get(event) ?? new Set<(payload: unknown) => void>();
        set.add(cb);
        listenersRef.current.set(event, set);
        return () => set.delete(cb);
      },
    }),
    [
      baseContext,
      phase,
      status,
      messages,
      typing,
      pendingAttachments,
      actions,
      loadData,
      template.capabilities,
    ],
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
          actions.sendMessage(action.payload.content, action.payload.attachmentIds);
          break;
        case "attachFile":
          void actions.attachFile(
            action.payload.fieldName,
            new File([action.payload.data], action.payload.name, {
              type: action.payload.mime,
            }),
          );
          break;
        case "removeAttachment":
          void actions.removeAttachment(action.payload.attachmentId);
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
        case "openWidget":
          actions.openWidget(action.payload);
          break;
        case "closeWidget":
          actions.closeWidget();
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
