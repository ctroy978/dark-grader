import { describe, expect, it } from "vitest";
import {
  bossImpactDurationMs,
  bossTelegraphDurationMs,
  bossThreatTier,
  defaultTelegraphLines,
} from "./bossPresentation.js";

describe("bossPresentation", () => {
  it("tiers cascade as ultimate and slam as light", () => {
    expect(bossThreatTier("Cascade")).toBe("ultimate");
    expect(bossThreatTier("CrushMagnet")).toBe("heavy");
    expect(bossThreatTier("FrontSlam")).toBe("light");
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
});
