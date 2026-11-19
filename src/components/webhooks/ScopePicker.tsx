"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { WebhookChatbotOption } from "./types";

type Scope = { chatLinkId: string; ficheKey: string };
type VisibleGroup = {
  bot: WebhookChatbotOption;
  showAll: boolean;
  fiches: WebhookChatbotOption["fiches"];
};
type PickerOption = {
  id: string;
  chatLinkId: string;
  ficheKey: string;
  label: string;
  groupLabel: string;
  all: boolean;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

function allOptionId(chatLinkId: string): string {
  return `wh-scope-${chatLinkId}-all`;
}

function ficheOptionId(chatLinkId: string, ficheKey: string): string {
  return `wh-scope-${chatLinkId}-${ficheKey}`;
}

function groupsFor(query: string, chatbots: WebhookChatbotOption[]): VisibleGroup[] {
  const needle = normalize(query);
  if (needle === "") {
    return chatbots.map((bot) => ({ bot, showAll: true, fiches: bot.fiches }));
  }
  return chatbots.flatMap((bot) => {
    const botMatches = normalize(bot.label).includes(needle);
    const fiches = bot.fiches.filter((fiche) => normalize(fiche.label).includes(needle));
    if (!botMatches && fiches.length === 0) return [];
    return [{ bot, showAll: botMatches, fiches: botMatches ? bot.fiches : fiches }];
  });
}

function optionsFor(groups: VisibleGroup[]): PickerOption[] {
  return groups.flatMap((group) => [
    ...(group.showAll
      ? [
          {
            id: allOptionId(group.bot.chatLinkId),
            chatLinkId: group.bot.chatLinkId,
            ficheKey: "",
            label: "Toutes les fiches",
            groupLabel: group.bot.label,
            all: true,
          },
        ]
      : []),
    ...group.fiches.map((fiche) => ({
      id: ficheOptionId(group.bot.chatLinkId, fiche.key),
      chatLinkId: group.bot.chatLinkId,
      ficheKey: fiche.key,
      label: fiche.label,
      groupLabel: group.bot.label,
      all: false,
    })),
  ]);
}

export function ScopePicker({
  chatbots,
  value,
  onChange,
  labelId,
}: {
  chatbots: WebhookChatbotOption[];
  value: Scope;
  onChange: (scope: Scope) => void;
  labelId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const selectedBot = chatbots.find((bot) => bot.chatLinkId === value.chatLinkId);
  const selectedFiche = selectedBot?.fiches.find((fiche) => fiche.key === value.ficheKey);
  const selectedLabel = selectedBot?.label ?? "Sélectionner un périmètre";
  const selectedDetail =
    selectedFiche?.label ?? (value.ficheKey === "" ? "Toutes les fiches" : "Fiche introuvable");

  const groups = useMemo(() => groupsFor(query, chatbots), [query, chatbots]);
  const options = useMemo(() => optionsFor(groups), [groups]);

  const close = useCallback((returnFocus = true): void => {
    setOpen(false);
    setQuery("");
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  function choose(option: PickerOption): void {
    onChange({ chatLinkId: option.chatLinkId, ficheKey: option.ficheKey });
    close();
  }

  function openPicker(): void {
    setOpen(true);
    setQuery("");
    const initialOptions = optionsFor(groupsFor("", chatbots));
    const selectedIndex = initialOptions.findIndex(
      (option) => option.chatLinkId === value.chatLinkId && option.ficheKey === value.ficheKey,
    );
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (document.getElementById(listboxId)?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, listboxId, close]);

  useEffect(() => {
    if (!open) return;
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const active = options[activeIndex];
    if (active !== undefined) {
      document.getElementById(active.id)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex, options]);

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(options.length - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option !== undefined) choose(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  const activeId = options[activeIndex]?.id;

  return (
    <div className="wh-scope">
      <button
        ref={triggerRef}
        type="button"
        className="wh-scope-trigger"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => (open ? close(false) : openPicker())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!open) openPicker();
          }
        }}
      >
        <span className="wh-scope-value">
          <strong>{selectedLabel}</strong>
          <small>{selectedDetail}</small>
        </span>
        <span className="wh-scope-chevron" aria-hidden="true">
          ⌄
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="wh-scope-backdrop"
            aria-label="Fermer la sélection du périmètre"
            onClick={() => close(false)}
          />
          <div className="wh-scope-popover" id={listboxId}>
            <div className="wh-scope-search">
              <span aria-hidden="true">⌕</span>
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                aria-label="Rechercher un chatbot ou une fiche"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={`${listboxId}-list`}
                aria-activedescendant={activeId}
                value={query}
                placeholder="Rechercher un chatbot ou une fiche…"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
              />
              <button
                type="button"
                className="wh-scope-close"
                onClick={() => close()}
                aria-label="Fermer la sélection du périmètre"
              >
                Fermer
              </button>
            </div>
            <div className="wh-scope-list" id={`${listboxId}-list`} role="listbox">
              {options.length === 0 ? (
                <p className="wh-scope-empty">Aucun périmètre trouvé.</p>
              ) : null}
              {groups.map((group) => (
                <div className="wh-scope-group" key={group.bot.chatLinkId}>
                  <div className="wh-scope-group-head">
                    <span>{group.bot.label}</span>
                    <span>
                      {group.fiches.length} fiche{group.fiches.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  {group.showAll ? (
                    <button
                      type="button"
                      id={allOptionId(group.bot.chatLinkId)}
                      role="option"
                      aria-selected={
                        value.chatLinkId === group.bot.chatLinkId && value.ficheKey === ""
                      }
                      className={`wh-scope-option ${
                        value.chatLinkId === group.bot.chatLinkId && value.ficheKey === ""
                          ? "is-selected"
                          : ""
                      } ${
                        options[activeIndex]?.id === allOptionId(group.bot.chatLinkId)
                          ? "is-active"
                          : ""
                      }`}
                      onMouseEnter={() =>
                        setActiveIndex(
                          options.findIndex(
                            (option) => option.id === allOptionId(group.bot.chatLinkId),
                          ),
                        )
                      }
                      onClick={() =>
                        choose({
                          id: allOptionId(group.bot.chatLinkId),
                          chatLinkId: group.bot.chatLinkId,
                          ficheKey: "",
                          label: "Toutes les fiches",
                          groupLabel: group.bot.label,
                          all: true,
                        })
                      }
                    >
                      <span className="wh-scope-option-label">
                        Toutes les fiches
                        <span className="wh-scope-badge">Tout</span>
                      </span>
                      <span className="wh-scope-check" aria-hidden="true">
                        {value.chatLinkId === group.bot.chatLinkId && value.ficheKey === ""
                          ? "✓"
                          : ""}
                      </span>
                    </button>
                  ) : null}
                  {group.fiches.map((fiche) => {
                    const id = ficheOptionId(group.bot.chatLinkId, fiche.key);
                    const selected =
                      value.chatLinkId === group.bot.chatLinkId && value.ficheKey === fiche.key;
                    return (
                      <button
                        type="button"
                        id={id}
                        role="option"
                        aria-selected={selected}
                        className={`wh-scope-option ${selected ? "is-selected" : ""} ${
                          activeId === id ? "is-active" : ""
                        }`}
                        key={fiche.key}
                        onMouseEnter={() =>
                          setActiveIndex(options.findIndex((option) => option.id === id))
                        }
                        onClick={() =>
                          choose({
                            id,
                            chatLinkId: group.bot.chatLinkId,
                            ficheKey: fiche.key,
                            label: fiche.label,
                            groupLabel: group.bot.label,
                            all: false,
                          })
                        }
                      >
                        <span className="wh-scope-option-label">{fiche.label}</span>
                        <span className="wh-scope-check" aria-hidden="true">
                          {selected ? "✓" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="wh-scope-foot">
              Le webhook se déclenchera pour les fiches du périmètre sélectionné.
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
