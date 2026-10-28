"use client";

export function SearchInput({
  value,
  onChange,
  placeholder = "Rechercher…",
  label = "Rechercher",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <label className="list-search">
      <span className="sr-only">{label}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
