import { describe, expect, it } from "vitest";
import {
  bossImpactDurationMs,
  bossTelegraphDurationMs,
  bossThreatTier,
  bossWindupTheme,
  defaultTelegraphLines,
} from "./bossPresentation.js";

describe("bossPresentation", () => {
  it("tiers cascade/grounded as ultimate and slam as light", () => {
    expect(bossThreatTier("Cascade")).toBe("ultimate");
    expect(bossThreatTier("Grounded")).toBe("ultimate");
    expect(bossThreatTier("CrushMagnet")).toBe("heavy");
    expect(bossThreatTier("FrontSlam")).toBe("light");
  });

  it("maps wind-up color themes by attack family", () => {
    expect(bossWindupTheme("PoisonCloud")).toBe("poison");
    expect(bossWindupTheme("SummonMossMites")).toBe("summon");
    expect(bossWindupTheme("SummonBoneArchers")).toBe("summon");
    expect(bossWindupTheme("Cascade")).toBe("ember");
    expect(bossWindupTheme("FrontSlam")).toBe("ember");
    expect(bossWindupTheme("FireCloud")).toBe("ember");
    expect(bossWindupTheme("RattleSpark")).toBe("shock");
    expect(bossWindupTheme("Grounded")).toBe("shock");
    expect(bossWindupTheme("SpreadingFrost")).toBe("frost");
    expect(bossWindupTheme("NorthWind")).toBe("frost");
    expect(bossWindupTheme("SouthWind")).toBe("frost");
    expect(bossThreatTier("SpreadingFrost")).toBe("heavy");
    expect(bossThreatTier("NorthWind")).toBe("light");
  });

  it("gives longer wind-up to ultimate than light", () => {
    expect(bossTelegraphDurationMs("ultimate")).toBeGreaterThan(
      bossTelegraphDurationMs("light"),
    );
    expect(bossImpactDurationMs("ultimate")).toBeGreaterThan(
      bossImpactDurationMs("light"),
    );
  });

  it("leaves multi-second room for epic heavy/ultimate audio", () => {
    // Light stays snappy; big hits must fit ~2–3s+ stings, not pin-hammer whooshes
    expect(bossTelegraphDurationMs("light")).toBeLessThan(2000);
    expect(bossImpactDurationMs("light")).toBeLessThan(1800);
    expect(bossTelegraphDurationMs("heavy")).toBeGreaterThanOrEqual(3000);
    expect(bossImpactDurationMs("heavy")).toBeGreaterThanOrEqual(2500);
    expect(bossTelegraphDurationMs("ultimate")).toBeGreaterThanOrEqual(4000);
    expect(bossImpactDurationMs("ultimate")).toBeGreaterThanOrEqual(3500);
  });

  it("has short telegraph lines for cascade", () => {
    const lines = defaultTelegraphLines("Cascade");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.length < 24)).toBe(true);
  });

  it("keeps summon telegraph lines distinct (no shared Ohms for mites)", () => {
    const mites = defaultTelegraphLines("SummonMossMites");
    const ohms = defaultTelegraphLines("SummonOhms");
    const imps = defaultTelegraphLines("SummonCinderImps");
    const archers = defaultTelegraphLines("SummonBoneArchers");
    expect(mites.some((l) => /mite/i.test(l))).toBe(true);
    expect(mites.every((l) => !/ohm/i.test(l))).toBe(true);
    expect(ohms.some((l) => /ohm/i.test(l))).toBe(true);
    expect(imps.some((l) => /imp/i.test(l))).toBe(true);
    expect(archers.some((l) => /archer|bone/i.test(l))).toBe(true);
  });
});
