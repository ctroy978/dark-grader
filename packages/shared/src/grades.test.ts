import { describe, expect, it } from "vitest";
import {
  downgradeGrade,
  runesingerBGrade,
  upgradeGrade,
} from "./grades.js";

describe("grade shifts", () => {
  it("upgradeGrade caps at A", () => {
    expect(upgradeGrade("F", 2)).toBe("C");
    expect(upgradeGrade("D", 2)).toBe("B");
    expect(upgradeGrade("C", 2)).toBe("A");
    expect(upgradeGrade("B", 2)).toBe("A");
    expect(upgradeGrade("A", 2)).toBe("A");
    expect(upgradeGrade("F", 1)).toBe("D");
  });

  it("downgradeGrade floors at F", () => {
    expect(downgradeGrade("A")).toBe("B");
    expect(downgradeGrade("D")).toBe("F");
    expect(downgradeGrade("F")).toBe("F");
  });

  it("runesingerBGrade is parallel (F→C not B; B stays B)", () => {
    expect(runesingerBGrade("F")).toBe("C");
    expect(runesingerBGrade("D")).toBe("C");
    expect(runesingerBGrade("C")).toBe("B");
    expect(runesingerBGrade("B")).toBe("B");
    expect(runesingerBGrade("A")).toBe("A");
  });
});
