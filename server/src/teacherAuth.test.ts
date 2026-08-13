import { describe, expect, it } from "vitest";
import { pinFromRequest, pinsMatch } from "./teacherAuth.js";

describe("pinsMatch", () => {
  it("accepts the exact PIN", () => {
    expect(pinsMatch("secret12", "secret12")).toBe(true);
  });

  it("rejects a wrong PIN of the same length", () => {
    expect(pinsMatch("secret13", "secret12")).toBe(false);
  });

  it("rejects a different length without throwing", () => {
    expect(pinsMatch("nope", "secret12")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(pinsMatch(undefined, "secret12")).toBe(false);
    expect(pinsMatch(12, "secret12")).toBe(false);
  });
});

describe("pinFromRequest", () => {
  it("prefers the X-Teacher-Pin header over body and query", () => {
    expect(
      pinFromRequest({
        headers: { "x-teacher-pin": "from-header" },
        body: { pin: "from-body" },
        query: { pin: "from-query" },
      }),
    ).toBe("from-header");
  });

  it("falls back to the JSON body", () => {
    expect(
      pinFromRequest({
        headers: {},
        body: { pin: "from-body" },
        query: { pin: "from-query" },
      }),
    ).toBe("from-body");
  });

  it("falls back to the query string last", () => {
    expect(
      pinFromRequest({
        headers: {},
        query: { pin: "from-query" },
      }),
    ).toBe("from-query");
  });
});
