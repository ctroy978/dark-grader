import { describe, expect, it } from "vitest";
import { getBossTemplate, loadBossTemplates } from "./bossLoader.js";

describe("boss TOML loader", () => {
  it("loads campaign bosses from content packs", () => {
    const list = loadBossTemplates(true);
    expect(list.map((b) => b.id).sort()).toEqual([
      "ash_wraith",
      "bone_colossus",
      "moss_grub",
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
    const summon = colossus!.attacks.find((a) => a.id === "SummonBoneArchers");
    expect(summon?.summon?.minionName).toBe("Bone Archer");
    expect(summon?.summon?.maxHp).toBe(12);
    expect(summon?.summon?.freeVolley).toBe(true);
  });

  it("loads Moss Grub tutorial kit with soft mites", () => {
    const grub = getBossTemplate("moss_grub");
    expect(grub).toBeDefined();
    expect(grub!.maxHp).toBe(130);
    expect(grub!.enrageDamageMult).toBe(1);
    expect(grub!.attackIds).toEqual(
      expect.arrayContaining(["LightFrontSlam", "LightLineAttack", "SummonMossMites"]),
    );
    expect(grub!.attackIds).not.toContain("Cascade");
    expect(grub!.attackIds).not.toContain("PoisonCloud");
    const mites = grub!.attacks.find((a) => a.id === "SummonMossMites");
    expect(mites?.summon).toMatchObject({
      minionId: "moss_mite",
      minionName: "Moss Mite",
      maxHp: 7,
      damage: 2,
      maxCount: 2,
      freeVolley: false,
      openCount: 1,
    });
  });
});
