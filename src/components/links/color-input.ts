const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^rgb\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)$/i;
const COMPLETE_HEX = /^#?[0-9a-f]{6}$/i;

function expandHex(value: string): string {
  const digits = value.length === 3 ? value.replace(/./g, "$&$&") : value;
  return `#${digits.toLowerCase()}`;
}

/** Convertit une saisie hexadécimale ou `rgb(r, g, b)` en `#rrggbb` canonique. */
export function normalizeColorInput(raw: string): string | null {
  const value = raw.trim();
  const hex = HEX.exec(value);
  if (hex !== null) return expandHex(hex[1] ?? "");
  const rgb = RGB.exec(value);
  if (rgb === null) return null;
  const channels = rgb.slice(1, 4).map((channel) => Number(channel));
  if (channels.some((channel) => channel < 0 || channel > 255)) return null;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Vrai dès que la saisie est complète : évite de réécrire le champ pendant la frappe. */
export function isCompleteColorInput(raw: string): boolean {
  const value = raw.trim();
  return COMPLETE_HEX.test(value) || RGB.test(value);
}
