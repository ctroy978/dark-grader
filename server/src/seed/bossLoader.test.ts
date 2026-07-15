import { describe, expect, it } from "vitest";
import { getBossTemplate, loadBossTemplates } from "./bossLoader.js";

describe("boss TOML loader", () => {
  it("loads both campaign bosses from content packs", () => {
    const list = loadBossTemplates(true);
    expect(list.map((b) => b.id).sort()).toEqual([
      "ash_wraith",
      "bone_colossus",
    ]);
  });

  it("includes attacks, weights, and audio packs", () => {
    const colossus = getBossTemplate("bone_colossus");
    expect(colossus).toBeDefined();
    expect(colossus!.maxHp).toBe(230);
    expect(colossus!.attackIds).toContain("Cascade");
    expect(colossus!.attackIds).toContain("SummonBoneArchers");
    expect(colossus!.audio.length).toBeGreaterThan(3);
    expect(colossus!.gruntPool.length).toBeGreaterThan(0);
    const cascade = colossus!.attacks.find((a) => a.id === "Cascade");
    expect(cascade?.weight).toBe(4);
    expect(cascade?.bubble_lines?.length).toBeGreaterThan(0);
  });
});
