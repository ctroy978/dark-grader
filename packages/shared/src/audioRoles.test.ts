import { describe, expect, it } from "vitest";
import {
  ARCHETYPE_ATTACK_SFX,
  archetypeArtGender,
  attackSfxCandidates,
  partyHurtSfxCandidates,
} from "./audioRoles.js";
import type { Archetype } from "./types.js";

const ALL: Archetype[] = [
  "Vanguard",
  "ShieldMaiden",
  "FireMage",
  "Healer",
  "Archer",
  "Doomcaller",
  "Necromancer",
  "Thundercaller",
  "Runesinger",
];

describe("audioRoles", () => {
  it("maps art gender from names/art contract", () => {
    expect(archetypeArtGender("Vanguard")).toBe("male");
    expect(archetypeArtGender("FireMage")).toBe("male");
    expect(archetypeArtGender("Doomcaller")).toBe("male");
    expect(archetypeArtGender("Necromancer")).toBe("male");
    expect(archetypeArtGender("Thundercaller")).toBe("male");
    expect(archetypeArtGender("ShieldMaiden")).toBe("female");
    expect(archetypeArtGender("Healer")).toBe("female");
    expect(archetypeArtGender("Archer")).toBe("female");
    expect(archetypeArtGender("Runesinger")).toBe("female");
  });

  it("gives every archetype a unique act_* attack id", () => {
    const ids = ALL.map((a) => ARCHETYPE_ATTACK_SFX[a]);
    expect(new Set(ids).size).toBe(ALL.length);
    expect(ARCHETYPE_ATTACK_SFX.Healer).toBe("act_healer");
    expect(attackSfxCandidates("Healer", "A")).toEqual([
      "act_healer",
      "heal",
      "hit_light",
    ]);
  });

  it("F always prefers fizzle then explosion_f", () => {
    for (const a of ALL) {
      expect(attackSfxCandidates(a, "F")).toEqual(["fizzle", "explosion_f"]);
    }
  });

  it("hurt candidates are gendered", () => {
    expect(partyHurtSfxCandidates("Vanguard")[0]).toBe("hurt_male");
    expect(partyHurtSfxCandidates("Archer")[0]).toBe("hurt_female");
  });
});
