"use client";

import { type InputHTMLAttributes, useState } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-control">
      <input {...props} className={className} type={visible ? "text" : "password"} />
      <button
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        aria-pressed={visible}
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        {visible ? (
          <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
            <path
              d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.2 5.4A10.9 10.9 0 0 1 12 5c5.5 0 9 7 9 7a16 16 0 0 1-2.1 3.2M6.6 6.8C4 8.4 3 12 3 12s3.5 7 9 7c1 0 2-.2 2.8-.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        ) : (
          <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
            <path
              d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </button>
    </span>
  );
}
