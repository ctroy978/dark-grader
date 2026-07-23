import { describe, expect, it } from "vitest";
import { buildBossScout } from "./bosses.js";
import { getBossTemplate, loadBossTemplates } from "./bossLoader.js";

describe("boss TOML loader", () => {
  it("loads campaign bosses from content packs", () => {
    const list = loadBossTemplates(true);
    expect(list.map((b) => b.id).sort()).toEqual([
      "ash_wraith",
      "bone_colossus",
      "cinder_herald",
      "moss_grub",
      "rattle_captain",
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
      shotSfx: "minion_moss_mite",
      shotBubble: "Nibble!",
    });
  });

  it("loads Cinder Herald with fire cloud, real imps, no cascade / poison", () => {
    const herald = getBossTemplate("cinder_herald");
    expect(herald).toBeDefined();
    expect(herald!.maxHp).toBe(170);
    expect(herald!.enrageDamageMult).toBe(1.2);
    expect(herald!.traits).toContain("Fire");
    expect(herald!.attackIds).toEqual(
      expect.arrayContaining([
        "FrontSlam",
        "LineAttack",
        "FireCloud",
        "SummonCinderImps",
      ]),
    );
    expect(herald!.attackIds).not.toContain("Cascade");
    expect(herald!.attackIds).not.toContain("PoisonCloud");
    expect(herald!.attackIds).not.toContain("Regenerate");
    const fire = herald!.attacks.find((a) => a.id === "FireCloud");
    expect(fire?.weight).toBe(3);
    const imps = herald!.attacks.find((a) => a.id === "SummonCinderImps");
    expect(imps?.summon).toMatchObject({
      minionId: "cinder_imp",
      minionName: "Cinder Imp",
      maxHp: 11,
      damage: 3,
      maxCount: 2,
      freeVolley: false,
      openCount: 1,
      onHitDot: { type: "Fire", stacks: 1 },
      shotSfx: "minion_cinder_imp",
      shotBubble: "Spit!",
    });
  });

  it("loads Bone Archer shot SFX from Colossus summon row", () => {
    const colossus = getBossTemplate("bone_colossus");
    const summon = colossus!.attacks.find((a) => a.id === "SummonBoneArchers");
    expect(summon?.summon).toMatchObject({
      minionId: "bone_archer",
      shotSfx: "minion_bone_archer",
      shotBubble: "Loose!",
    });
  });

  it("builds student scout cards with attacks and minions (no party advice)", () => {
    const ash = buildBossScout("ash_wraith");
    expect(ash).toBeDefined();
    expect(ash!.name).toBe("Ash Wraith");
    expect(ash!.minions).toEqual([]);
    expect(ash!.attacks.map((a) => a.id)).toEqual(
      expect.arrayContaining(["Cascade", "PoisonCloud", "CrushMagnet"]),
    );
    expect(ash!.attacks.every((a) => a.name && a.description)).toBe(true);
    expect(ash!.enrageBelowHpPct).toBe(0.4);
    expect(ash!.enrageNote).toMatch(/Enrages below 40%/);

    const herald = buildBossScout("cinder_herald");
    expect(herald!.minions).toHaveLength(1);
    expect(herald!.minions[0]).toMatchObject({
      id: "cinder_imp",
      name: "Cinder Imp",
      opensFight: true,
      onHitDot: "Fire",
    });
    expect(herald!.attacks.map((a) => a.id)).toContain("FireCloud");
    expect(herald!.attacks.map((a) => a.id)).not.toContain("SummonCinderImps");

    const grub = buildBossScout("moss_grub");
    expect(grub!.enrageBelowHpPct).toBeNull();
    expect(grub!.minions[0]?.name).toBe("Moss Mite");
  });
});


