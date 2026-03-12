function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function parseJson<T>(key: string, raw: string, kind: "localStorage" | "sessionStorage"): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`Invalid JSON in ${kind} for key "${key}"`, error);
    return null;
  }
}

export function readLocalJson<T>(key: string): T | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  return parseJson<T>(key, raw, "localStorage");
}

export function writeLocalJson(key: string, value: unknown): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function removeLocalKey(key: string): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(key);
}

export function readSessionJson<T>(key: string): T | null {
  if (!isBrowser()) return null;
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  return parseJson<T>(key, raw, "sessionStorage");
}

export function writeSessionJson(key: string, value: unknown): void {
  if (!isBrowser()) return;
  window.sessionStorage.setItem(key, JSON.stringify(value));
}
