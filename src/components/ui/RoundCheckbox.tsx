"use client";

import { type ReactNode, useEffect, useRef } from "react";

/**
 * Case à cocher ronde, accessible via un input natif.
 * `indeterminate` est posé sur l'input (propriété non contrôlable en JSX).
 */
export function RoundCheckbox({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel,
  disabled = false,
  children,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current !== null) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <label className={["round-checkbox", className].filter(Boolean).join(" ")}>
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {children === undefined ? null : <span className="round-checkbox-label">{children}</span>}
    </label>
  );
}
