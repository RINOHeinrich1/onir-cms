"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Description longue : texte brut, retours à la ligne conservés et prévisualisés. */
export function DescriptionField({
  defaultValue = "",
  maxLength = 2000,
}: {
  defaultValue?: string;
  maxLength?: number;
}) {
  const [value, setValue] = useState(() => defaultValue.replace(/\r\n?/g, "\n"));
  const ref = useRef<HTMLTextAreaElement>(null);

  const autoGrow = useCallback((): void => {
    const el = ref.current;
    if (el === null) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 128), 300)}px`;
  }, []);

  useEffect(() => {
    autoGrow();
  }, [autoGrow]);

  return (
    <>
      <label className="field">
        Discussion / description longue (facultatif)
        <textarea
          ref={ref}
          name="description"
          rows={5}
          maxLength={maxLength}
          value={value}
          spellCheck
          placeholder="Contexte, discussion, notes…"
          onChange={(event) => {
            setValue(event.target.value);
            requestAnimationFrame(autoGrow);
          }}
        />
      </label>
      <div className="description-meta">
        <span>Les retours à la ligne sont conservés et affichés côté template.</span>
        <span>
          {value.length} / {maxLength}
        </span>
      </div>
      <div className="description-preview">
        {value.trim() === "" ? (
          <span className="description-empty">L’aperçu apparaîtra ici.</span>
        ) : (
          value
        )}
      </div>
    </>
  );
}
