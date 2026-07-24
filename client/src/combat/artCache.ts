/**
 * Browser cache-bust for `/art/**` PNGs.
 * Fixed URLs like `/art/vanguard/standing.png` stick in Chrome for days after
 * you replace files on disk. One stamp per full page load is enough for
 * classroom iteration without re-fetching every animation frame.
 */
export const ART_CACHE_V = String(Date.now());

/** Append `?v=` (or `&v=`) so the browser treats the file as new. */
export function artAssetUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const sep = p.includes("?") ? "&" : "?";
  return `${p}${sep}v=${ART_CACHE_V}`;
}
