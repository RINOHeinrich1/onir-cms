export function PluginIcon({ kind }: { kind: "immersive" | "starter" }) {
  if (kind === "immersive") {
    return (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="plugin-icon"
        aria-hidden
      >
        <path d="M10 24 32 12l22 12-22 12L10 24Z" />
        <path d="M10 24v18l22 12 22-12V24" />
        <path d="M32 36v18" />
        <path d="m21 18 22 12" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="plugin-icon"
      aria-hidden
    >
      <path d="M12 16h40v26H28l-10 8v-8H12V16Z" />
      <path d="M21 27h22M21 34h14" />
    </svg>
  );
}
