const TRUST_LABELS: Record<string, string> = {
  official: "Officiel",
  verified: "Vérifié",
  community: "Communauté",
};

const MODE_LABELS: Record<string, string> = {
  "web-component": "Web component",
  iframe: "Iframe",
};

export function trustLabel(value: string): string {
  return TRUST_LABELS[value] ?? value;
}

export function modeLabel(value: string): string {
  return MODE_LABELS[value] ?? value;
}
