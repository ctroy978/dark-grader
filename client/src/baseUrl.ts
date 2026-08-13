/** Vite `base` with no trailing slash. Empty when the app is hosted at `/`. */
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${p}`;
}
