import { timingSafeEqual } from "node:crypto";

const PIN_HEADER = "x-teacher-pin";

export function pinsMatch(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string" || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Prefer header (not written to nginx access logs) over body, then query. */
export function pinFromRequest(req: {
  headers: Record<string, unknown>;
  body?: unknown;
  query?: unknown;
}): unknown {
  const header = req.headers[PIN_HEADER];
  if (typeof header === "string" && header.length > 0) return header;
  if (Array.isArray(header) && typeof header[0] === "string" && header[0]) {
    return header[0];
  }
  if (req.body && typeof req.body === "object" && "pin" in req.body) {
    return (req.body as { pin?: unknown }).pin;
  }
  if (req.query && typeof req.query === "object" && "pin" in req.query) {
    return (req.query as { pin?: unknown }).pin;
  }
  return undefined;
}
