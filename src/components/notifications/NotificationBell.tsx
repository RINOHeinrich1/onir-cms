"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import type { ActivityNotification } from "@/domain/activity-notification";

const DEFAULT_LIMIT = 6;
const PAGE_SIZE = 10;
const MAX_LIMIT = 50;
const POLL_MS = 8_000;
const TOAST_MS = 15_000;
const SEEN_LIMIT = 200;

type Feed = {
  items?: ActivityNotification[];
  unreadCount?: number;
  hasMore?: boolean;
  lastReadAt?: string;
};

/** Temps relatif court, calculé au rendu du panneau. */
function relativeTime(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const diff = Math.max(0, Date.now() - time);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

/**
 * Cloche de notifications : compteur non lu, panneau limité et « Voir plus ».
 * Les classes DOM sont préfixées `activity-` pour échapper aux filtres cosmétiques
 * des bloqueurs de publicité qui ciblent souvent `.notification`.
 */
export function NotificationBell({ organizationId }: { organizationId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [items, setItems] = useState<ActivityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seenRef = useRef<Set<string>>(new Set());
  const seenOrderRef = useRef<string[]>([]);
  const initializedRef = useRef(false);
  const baselineRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const readVersionRef = useRef(0);

  const remember = useCallback((id: string): void => {
    seenRef.current.add(id);
    seenOrderRef.current.push(id);
    while (seenOrderRef.current.length > SEEN_LIMIT) {
      const oldest = seenOrderRef.current.shift();
      if (oldest !== undefined) seenRef.current.delete(oldest);
    }
  }, []);

  const showToast = useCallback(
    (item: ActivityNotification): void => {
      toast.info(`${item.title} · ${item.detail}`, {
        durationMs: TOAST_MS,
        action: {
          label: item.kind === "conversation" ? "Ouvrir la conversation" : "Ouvrir le lead",
          onClick: () => router.push(item.href),
        },
      });
    },
    [router, toast],
  );

  const closePanel = useCallback((): void => {
    setOpen(false);
    setLimit(DEFAULT_LIMIT);
  }, []);

  const markRead = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/notifications/read", { method: "POST" });
      if (!response.ok) return;
      const json = (await response.json()) as { lastReadAt?: string };
      if (typeof json.lastReadAt !== "string") return;
      readVersionRef.current += 1;
      setUnreadCount(0);
      setItems((previous) => previous.map((item) => ({ ...item, read: true })));
    } catch {
      // Le prochain polling réessaiera de refléter l'état serveur.
    }
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (inFlightRef.current || document.visibilityState === "hidden") return;
    inFlightRef.current = true;
    const readVersion = readVersionRef.current;
    try {
      const response = await fetch(`/api/notifications?limit=${limit}`, { cache: "no-store" });
      if (!response.ok) {
        if (readVersion === readVersionRef.current) setError("Notifications indisponibles.");
        return;
      }
      const feed = (await response.json()) as Feed;
      if (readVersion !== readVersionRef.current) return;

      const nextItems = feed.items ?? [];
      const newest = nextItems[0]?.createdAt ?? new Date().toISOString();
      if (!initializedRef.current) {
        initializedRef.current = true;
        baselineRef.current = newest;
        for (const item of nextItems) remember(item.id);
      } else {
        const baseline = baselineRef.current ?? newest;
        for (const item of nextItems) {
          if (seenRef.current.has(item.id)) continue;
          remember(item.id);
          if (item.createdAt > baseline) showToast(item);
        }
        if (baselineRef.current === null || newest > baselineRef.current) {
          baselineRef.current = newest;
        }
      }

      setItems(nextItems);
      setUnreadCount(feed.unreadCount ?? 0);
      setHasMore(feed.hasMore === true);
      setError(null);
    } catch {
      if (readVersion === readVersionRef.current) setError("Notifications indisponibles.");
    } finally {
      inFlightRef.current = false;
    }
  }, [limit, remember, showToast]);

  useEffect(() => {
    if (organizationId === null) return;
    initializedRef.current = false;
    baselineRef.current = null;
    seenRef.current.clear();
    seenOrderRef.current = [];
    readVersionRef.current = 0;
    setLimit(DEFAULT_LIMIT);
    setOpen(false);
    setItems([]);
    setUnreadCount(0);
    setHasMore(false);
    setError(null);
  }, [organizationId]);

  useEffect(() => {
    if (organizationId === null) return;
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [organizationId, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closePanel]);

  const toggle = (): void => {
    if (open) {
      closePanel();
      return;
    }
    setOpen(true);
    void markRead();
    void load();
  };

  const seeMore = (): void => {
    setLimit((value) => Math.min(MAX_LIMIT, value + PAGE_SIZE));
  };

  const countLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div className="activity-bell">
      <button
        type="button"
        className="activity-bell-trigger"
        aria-label={
          unreadCount === 0 ? "Activité récente" : `Activité récente, ${unreadCount} non lues`
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="activity-popover"
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 ? (
          <span className="activity-bell-badge" aria-hidden>
            {countLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="activity-popover-backdrop"
            aria-label="Fermer l’activité récente"
            onClick={closePanel}
          />
          <div
            id="activity-popover"
            className="activity-popover"
            role="dialog"
            aria-label="Activité récente"
          >
            <div className="activity-popover-head">
              <strong>Notifications</strong>
              {unreadCount > 0 ? (
                <span className="badge orange">{unreadCount} nouvelles</span>
              ) : (
                <span className="muted-text">À jour</span>
              )}
            </div>

            {items.length === 0 ? (
              <p className="activity-empty">Aucune notification.</p>
            ) : (
              <ul className="activity-list">
                {items.map((item) => (
                  <li key={item.id} className={item.read ? undefined : "unread"}>
                    <Link className="activity-item" href={item.href} onClick={closePanel}>
                      <span className="activity-dot" aria-hidden />
                      <span className="activity-content">
                        <span className="activity-title">{item.title}</span>
                        <span className="activity-detail">{item.detail}</span>
                        <span className="activity-time">{relativeTime(item.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {hasMore && limit < MAX_LIMIT ? (
              <button type="button" className="activity-more" onClick={seeMore}>
                Voir plus
              </button>
            ) : null}
            {error !== null ? <p className="activity-error">{error}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
