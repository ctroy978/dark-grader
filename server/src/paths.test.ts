import { describe, expect, it } from "vitest";
import { normalizeBasePath, stripBasePath } from "./paths.js";

describe("normalizeBasePath", () => {
  it("treats root and empty as no prefix", () => {
    expect(normalizeBasePath(undefined)).toBe("");
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath("/")).toBe("");
  });

  it("normalizes the classroom subpath", () => {
    expect(normalizeBasePath("gradeforge")).toBe("/gradeforge");
    expect(normalizeBasePath("/gradeforge")).toBe("/gradeforge");
    expect(normalizeBasePath("/gradeforge/")).toBe("/gradeforge");
  });
});

describe("stripBasePath", () => {
  it("leaves URLs alone when there is no prefix", () => {
    expect(stripBasePath("/api/health", "")).toBe("/api/health");
  });

  it("strips /gradeforge from API, assets, and the index", () => {
    expect(stripBasePath("/gradeforge", "/gradeforge")).toBe("/");
    expect(stripBasePath("/gradeforge/", "/gradeforge")).toBe("/");
    expect(stripBasePath("/gradeforge/api/health", "/gradeforge")).toBe(
      "/api/health",
    );
    expect(stripBasePath("/gradeforge/assets/app.js", "/gradeforge")).toBe(
      "/assets/app.js",
    );
  });

  it("keeps the query string", () => {
    expect(stripBasePath("/gradeforge/api/audio/hit?v=3", "/gradeforge")).toBe(
      "/api/audio/hit?v=3",
    );
  });
});
