// Identité mémorisée (localStorage, clé par lien) — stockage injectable.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return EMAIL_RE.test(String(email ?? "").trim());
}

export function identityKey(pathname) {
  return `onirtech.identity.v1:${pathname}`;
}

export function loadIdentity(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (value && value.nom && value.email && isValidEmail(value.email)) return value;
  } catch { /* storage indisponible / JSON invalide */ }
  return null;
}

export function saveIdentity(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export function clearIdentity(storage, key) {
  try { storage.removeItem(key); } catch { /* ignore */ }
}
