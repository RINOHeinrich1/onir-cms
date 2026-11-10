"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useChatbotBuilder } from "@/components/chatbot-builder/ChatbotBuilderProvider";
import { Modal } from "@/components/ui/Modal";
import { AssistantFairy } from "./AssistantFairy";
import {
  ASSISTANT_WIDGET_HEIGHT,
  ASSISTANT_WIDGET_MARGIN,
  ASSISTANT_WIDGET_WIDTH,
  type AssistantPosition,
  assistantPositionRect,
  assistantRectsOverlap,
  buildAssistantCandidates,
  chooseAssistantPosition,
  clampAssistantPosition,
} from "./assistant-avoidance";
import { KnowledgeImportDialog } from "./KnowledgeImportDialog";

type AssistantPanel = "home" | "create" | "knowledge";
type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

const POSITION_KEY = "onir-assistant-position";
const TIP_DISMISS_KEY = "onir-assistant-tips-dismissed-until";
const TIP_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
const TIP_DELAY_MS = 12_000;
const TIP_REPEAT_MS = 60_000;
const TIP_VISIBLE_MS = 9_000;
const MAX_TIPS = 2;
const TIP_WIDTH = 238;
const WIDGET_WIDTH = ASSISTANT_WIDGET_WIDTH;
const WIDGET_HEIGHT = ASSISTANT_WIDGET_HEIGHT;
const WIDGET_MARGIN = ASSISTANT_WIDGET_MARGIN;
const DRAG_THRESHOLD = 4;
const AVOIDANCE_DELAY_MS = 100;
const TIP_MESSAGES = [
  "Je suis là si besoin.",
  "Créons un chatbot rapidement ?",
  "Je peux vous aider à démarrer.",
  "Une question sur ONIR ? Je suis là.",
];

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "label",
  "audio[controls]",
  "video[controls]",
  "[role='button']",
  "[role='link']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[tabindex]:not([tabindex='-1'])",
  "[data-fairy-avoid]",
].join(",");

function isOwnAssistantElement(element: Element | null): boolean {
  return element !== null && element.closest(".assistant-launcher, .assistant-tip") !== null;
}

function isVisibleControl(control: Element): boolean {
  if (!(control instanceof HTMLElement)) return false;
  if (control.matches(":disabled")) return false;
  if (control.closest("[inert], [aria-hidden='true']") !== null) return false;
  const rect = control.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(control).visibility !== "hidden";
}

function isInteractiveAt(x: number, y: number): boolean {
  for (const element of document.elementsFromPoint(x, y)) {
    if (isOwnAssistantElement(element)) continue;
    const control = element.closest(INTERACTIVE_SELECTOR);
    if (control !== null && !isOwnAssistantElement(control) && isVisibleControl(control)) {
      return true;
    }
  }
  return false;
}

function isPositionOverInteractive(
  position: AssistantPosition,
  size: { width: number; height: number },
): boolean {
  const rect = assistantPositionRect(position, size);
  const xPoints = [rect.left + 4, (rect.left + rect.right) / 2, rect.right - 4];
  const yPoints = [rect.top + 4, (rect.top + rect.bottom) / 2, rect.bottom - 4];
  for (const y of yPoints) {
    for (const x of xPoints) {
      if (isInteractiveAt(x, y)) return true;
    }
  }

  const active = document.activeElement;
  if (active instanceof HTMLElement && !isOwnAssistantElement(active)) {
    const activeControl = active.closest(INTERACTIVE_SELECTOR);
    if (
      activeControl !== null &&
      isVisibleControl(activeControl) &&
      assistantRectsOverlap(rect, activeControl.getBoundingClientRect())
    ) {
      return true;
    }
  }
  return false;
}

function clampPosition(position: AssistantPosition): AssistantPosition {
  return clampAssistantPosition(position, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
}

function defaultPosition(): AssistantPosition {
  return {
    x: window.innerWidth - WIDGET_WIDTH - WIDGET_MARGIN,
    y: window.innerHeight - WIDGET_HEIGHT - WIDGET_MARGIN,
  };
}

function readStoredPosition(): AssistantPosition | null {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "x" in value &&
      "y" in value &&
      typeof value.x === "number" &&
      typeof value.y === "number" &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y)
    ) {
      return { x: value.x, y: value.y };
    }
  } catch {
    return null;
  }
  return null;
}

function persistPosition(position: AssistantPosition): void {
  try {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  } catch {}
}

function tipsDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(TIP_DISMISS_KEY);
    return raw !== null && Number(raw) > Date.now();
  } catch {
    return false;
  }
}

function dismissTips(): void {
  try {
    window.localStorage.setItem(TIP_DISMISS_KEY, String(Date.now() + TIP_DISMISS_MS));
  } catch {}
}

function SparklesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l1.3 4.2L17.5 8.5l-4.2 1.3L12 14l-1.3-4.2L6.5 8.5l4.2-1.3L12 3z" />
      <path d="M18.5 14l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4z" />
      <path d="M5.5 15l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
      <path d="M8 7h8M8 10h5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Compagnon flottant disponible sur toutes les pages du dashboard. */
export function AssistantWidget() {
  const { openBuilder, builderOpen } = useChatbotBuilder();
  const [open, setOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [panel, setPanel] = useState<AssistantPanel>("home");
  const [position, setPosition] = useState<AssistantPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mockDone, setMockDone] = useState(false);
  const [idea, setIdea] = useState("");
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [tipVisible, setTipVisible] = useState(false);
  const [tipCount, setTipCount] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const blocked = open || knowledgeOpen || builderOpen || dragging;

  useEffect(() => {
    setPosition(clampPosition(readStoredPosition() ?? defaultPosition()));
  }, []);

  useEffect(() => {
    const onResize = () => {
      setPosition((current) => (current === null ? current : clampPosition(current)));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (position === null || blocked) return;

    let frame = 0;
    let timer = 0;
    let stopped = false;

    const resolve = () => {
      frame = 0;
      if (stopped) return;
      const launcher = launcherRef.current;
      const size = {
        width: launcher?.offsetWidth || WIDGET_WIDTH,
        height: launcher?.offsetHeight || WIDGET_HEIGHT,
      };
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const current = clampAssistantPosition(position, viewport, size);
      const candidates = buildAssistantCandidates(current, viewport, size);
      const next = chooseAssistantPosition(
        current,
        candidates,
        (candidate) => !isPositionOverInteractive(candidate, size),
      );
      if (next.x !== position.x || next.y !== position.y) {
        setPosition(next);
      }
    };

    const schedule = () => {
      if (frame !== 0 || timer !== 0) return;
      timer = window.setTimeout(() => {
        timer = 0;
        frame = window.requestAnimationFrame(resolve);
      }, AVOIDANCE_DELAY_MS);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("load", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("click", schedule, true);

    return () => {
      stopped = true;
      if (timer !== 0) window.clearTimeout(timer);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("load", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("click", schedule, true);
    };
  }, [blocked, position]);

  useEffect(() => {
    if (blocked) setTipVisible(false);
  }, [blocked]);

  useEffect(() => {
    if (blocked || tipVisible || tipCount >= MAX_TIPS || tipsDismissed()) return;
    const delay = tipCount === 0 ? TIP_DELAY_MS : TIP_REPEAT_MS;
    const timer = window.setTimeout(() => {
      setTipIndex(tipCount % TIP_MESSAGES.length);
      setTipCount((count) => count + 1);
      setTipVisible(true);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [blocked, tipVisible, tipCount]);

  useEffect(() => {
    if (!tipVisible) return;
    const timer = window.setTimeout(() => setTipVisible(false), TIP_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [tipVisible]);

  const dismissTip = () => {
    setTipVisible(false);
    dismissTips();
  };

  const close = () => {
    setOpen(false);
    setPanel("home");
    setMockDone(false);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || position === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) {
      drag.moved = true;
    }
    setPosition(clampPosition({ x: drag.originX + deltaX, y: drag.originY + deltaY }));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      const next = clampPosition({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      });
      setPosition(next);
      persistPosition(next);
      return;
    }
    if (open) {
      close();
      return;
    }
    setTipVisible(false);
    setOpen(true);
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (open) {
      close();
      return;
    }
    setTipVisible(false);
    setOpen(true);
  };

  const selectPanel = (next: AssistantPanel) => {
    setPanel(next);
    setMockDone(false);
  };

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMockDone(true);
  };

  const submitKnowledge = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMockDone(true);
  };

  const tipBelow = position !== null && position.y < 120;
  const tipStyle =
    position === null
      ? undefined
      : {
          left: `${Math.max(
            WIDGET_MARGIN,
            Math.min(
              position.x + WIDGET_WIDTH - TIP_WIDTH,
              window.innerWidth - TIP_WIDTH - WIDGET_MARGIN,
            ),
          )}px`,
          top: `${tipBelow ? position.y + WIDGET_HEIGHT + 12 : position.y - 10}px`,
        };

  return (
    <>
      {builderOpen ? null : (
        <>
          <button
            ref={launcherRef}
            type="button"
            className={`assistant-launcher${dragging ? " is-dragging" : ""}${
              open ? " is-dialog-open" : ""
            }`}
            style={
              position === null
                ? undefined
                : {
                    left: `${position.x}px`,
                    top: `${position.y}px`,
                    right: "auto",
                    bottom: "auto",
                  }
            }
            aria-label="Assistante ONIR — ouvrir l’assistance"
            aria-haspopup="dialog"
            aria-expanded={open}
            title="Assistante ONIR — glissez pour déplacer"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
            onKeyDown={onKeyDown}
          >
            <AssistantFairy />
          </button>

          {tipVisible && position !== null ? (
            <div
              className={`assistant-tip${tipBelow ? " is-below" : ""}`}
              style={tipStyle}
              role="status"
              aria-live="polite"
            >
              <p>{TIP_MESSAGES[tipIndex]}</p>
              <button
                type="button"
                className="assistant-tip-close"
                onClick={dismissTip}
                aria-label="Masquer l’astuce"
              >
                ×
              </button>
            </div>
          ) : null}
        </>
      )}

      {open ? (
        <Modal
          title="Assistance IA"
          onClose={close}
          dialogClassName="assistant-modal"
          bodyClassName="assistant-modal-body"
        >
          {panel === "home" ? (
            <div className="assistant-home">
              <p className="assistant-intro">
                Bonjour, je suis la fée ONIR. Que souhaitez-vous faire ?
              </p>
              <div className="assistant-options">
                <button
                  type="button"
                  className="assistant-option"
                  onClick={() => {
                    close();
                    openBuilder();
                  }}
                >
                  <span className="assistant-option-icon">
                    <SparklesIcon />
                  </span>
                  <span className="assistant-option-copy">
                    <strong>Créer un chatbot avec IA</strong>
                    <small>Décrivez votre besoin et préparez une première version.</small>
                  </span>
                  <span className="assistant-option-arrow">
                    <ArrowIcon />
                  </span>
                </button>
                <button
                  type="button"
                  className="assistant-option"
                  onClick={() => {
                    close();
                    setKnowledgeOpen(true);
                  }}
                >
                  <span className="assistant-option-icon">
                    <BookIcon />
                  </span>
                  <span className="assistant-option-copy">
                    <strong>Remplir des connaissances</strong>
                    <small>Ajoutez des informations à la mémoire de votre assistant.</small>
                  </span>
                  <span className="assistant-option-arrow">
                    <ArrowIcon />
                  </span>
                </button>
              </div>
            </div>
          ) : null}

          {panel === "create" ? (
            <div className="assistant-panel">
              <button type="button" className="assistant-back" onClick={() => selectPanel("home")}>
                <span aria-hidden="true">←</span>
                Retour
              </button>
              <div className="assistant-panel-head">
                <span className="assistant-option-icon">
                  <SparklesIcon />
                </span>
                <div>
                  <h4>Créer un chatbot avec IA</h4>
                  <p>Décrivez le rôle, le ton et les objectifs de votre futur chatbot.</p>
                </div>
              </div>
              <form className="assistant-mock-form" onSubmit={submitCreate}>
                <label htmlFor="assistant-create-idea">Votre besoin</label>
                <textarea
                  id="assistant-create-idea"
                  rows={4}
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  placeholder="Ex. Un assistant commercial chaleureux pour présenter nos offres et qualifier les prospects."
                />
                <button type="submit" className="btn" disabled={idea.trim() === ""}>
                  Générer le chatbot
                </button>
              </form>
              {mockDone ? (
                <p className="assistant-mock-success" role="status">
                  <strong>Aperçu prêt.</strong> Votre chatbot serait créé dans l’espace de travail.
                </p>
              ) : null}
              <p className="assistant-mock-note">Simulation uniquement — aucune création réelle.</p>
            </div>
          ) : null}

          {panel === "knowledge" ? (
            <div className="assistant-panel">
              <button type="button" className="assistant-back" onClick={() => selectPanel("home")}>
                <span aria-hidden="true">←</span>
                Retour
              </button>
              <div className="assistant-panel-head">
                <span className="assistant-option-icon">
                  <BookIcon />
                </span>
                <div>
                  <h4>Remplir des connaissances</h4>
                  <p>Ajoutez une information utile à la base de connaissances.</p>
                </div>
              </div>
              <form className="assistant-mock-form" onSubmit={submitKnowledge}>
                <label htmlFor="assistant-knowledge-title">Titre</label>
                <input
                  id="assistant-knowledge-title"
                  type="text"
                  value={knowledgeTitle}
                  onChange={(event) => setKnowledgeTitle(event.target.value)}
                  placeholder="Ex. Conditions de retour"
                />
                <label htmlFor="assistant-knowledge-content">Contenu</label>
                <textarea
                  id="assistant-knowledge-content"
                  rows={4}
                  value={knowledgeContent}
                  onChange={(event) => setKnowledgeContent(event.target.value)}
                  placeholder="Ex. Les retours sont acceptés sous 30 jours avec le justificatif d’achat."
                />
                <button
                  type="submit"
                  className="btn"
                  disabled={knowledgeTitle.trim() === "" || knowledgeContent.trim() === ""}
                >
                  Ajouter à la base
                </button>
              </form>
              {mockDone ? (
                <p className="assistant-mock-success" role="status">
                  <strong>Connaissance ajoutée.</strong> Elle serait disponible pour votre
                  assistant.
                </p>
              ) : null}
              <p className="assistant-mock-note">
                Simulation uniquement — aucun contenu n’est enregistré.
              </p>
            </div>
          ) : null}
        </Modal>
      ) : null}
      {knowledgeOpen ? <KnowledgeImportDialog onClose={() => setKnowledgeOpen(false)} /> : null}
    </>
  );
}
