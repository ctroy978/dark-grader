import type { ClaimResult, Grade, Soldier, TeamState } from "@dungeon-grades/shared";
import {
  applyPartyDamage,
  formatPartyHit,
  healBoss,
  healSoldier,
  hitEnemies,
  livingParty,
  soldierAt,
} from "./damage.js";
import { cleanseDots } from "./dots.js";
import { randomInt } from "@dungeon-grades/shared";

export type LogFn = (text: string, tags?: string[]) => void;

export function resolveSpecialistAction(
  team: TeamState,
  soldier: Soldier,
  claim: ClaimResult,
  random: () => number,
  log: LogFn,
): void {
  if (!soldier.alive) return;
  // Clear personal block at start of own action (new block may be applied)
  // Keep block through boss phase if they already had it from earlier this round —
  // design: block is one-round absorb; we clear at start of next round instead.

  const g = claim.effectiveGrade;
  const label = `${soldier.name} (${soldier.archetype}) claimed ${claim.token}${
    claim.effectiveGrade !== claim.token ? `→${claim.effectiveGrade}` : ""
  }`;

  switch (soldier.archetype) {
    case "Vanguard":
      vanguard(soldier, g, team, log, label);
      break;
    case "ShieldMaiden":
      shieldMaiden(soldier, g, team, random, log, label);
      break;
    case "FireMage":
      fireMage(soldier, g, team, log, label);
      break;
    case "Healer":
      healer(soldier, g, team, log, label);
      break;
    case "Archer":
      archer(soldier, g, team, random, log, label);
      break;
    case "Doomcaller":
      doomcaller(soldier, g, team, log, label);
      break;
    case "Necromancer":
      necromancer(soldier, g, team, random, log, label);
      break;
    case "Thundercaller":
      thundercaller(soldier, g, team, random, log, label);
      break;
    case "Runesinger":
      runesinger(soldier, g, team, log, label);
      break;
    default:
      log(`${label}: unknown archetype`);
  }
}

function vanguard(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  // Nerfed block: still tanky, no longer near-immune to boss swings
  const table: Record<Grade, { block: number; dmg: number }> = {
    A: { block: 7, dmg: 11 },
    B: { block: 5, dmg: 9 },
    C: { block: 3, dmg: 6 },
    D: { block: 1, dmg: 0 },
    F: { block: 0, dmg: 0 },
  };
  const { block, dmg } = table[g];
  soldier.block += block;
  if (dmg > 0) {
    const r = hitEnemies(team, dmg);
    log(`${label}: +${block} block, hits for ${r}`);
  } else {
    log(`${label}: +${block} block, no attack`);
  }
}

function shieldMaiden(
  _soldier: Soldier,
  g: Grade,
  team: TeamState,
  random: () => number,
  log: LogFn,
  label: string,
): void {
  if (g === "C") {
    const roll = randomInt(random, 1, 6);
    team.partyShield = { remaining: roll, active: true };
    log(`${label}: rerolls party shield to ${roll}`);
    return;
  }
  if (g === "F") {
    if (team.partyShield.active && team.partyShield.remaining > 0) {
      const target =
        soldierAt(team, team.magnetPosition) ?? livingParty(team)[0];
      if (target) {
        applyPartyDamage(target, 1, team.partyShield);
        log(`${label}: shield short-circuits! 1 damage near magnet`);
      }
    } else {
      log(`${label}: no attack (shield already down)`);
    }
    return;
  }
  const dmg = g === "A" ? 14 : g === "B" ? 11 : 4;
  const r = hitEnemies(team, dmg);
  log(`${label}: attacks for ${r}`);
}

function fireMage(
  _soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  const cleanseable = ["Ice", "Poison", "Slime"] as const;

  if (g === "A") {
    const r = hitEnemies(team, 16);
    const n = cleanseDots(livingParty(team), [...cleanseable]);
    log(`${label}: ${r}; cleansed ${n} non-Fire DoTs`);
    return;
  }
  if (g === "B") {
    const r = hitEnemies(team, 12);
    const front = livingParty(team).filter(
      (s) => s.position && s.position <= 3,
    );
    const n = cleanseDots(front, [...cleanseable]);
    log(`${label}: ${r}; cleansed front (${n})`);
    return;
  }
  if (g === "C") {
    const r = hitEnemies(team, 10);
    const hits: string[] = [];
    for (const pos of [1, 2] as const) {
      const s = soldierAt(team, pos);
      if (s) {
        hits.push(
          formatPartyHit(
            s,
            applyPartyDamage(s, 2, team.partyShield, { bypassAbsorb: true }),
          ),
        );
      }
    }
    log(`${label}: ${r}; friendly fire (ignores shield/block): ${hits.join("; ") || "nobody"}`);
    return;
  }
  if (g === "D") {
    const r = hitEnemies(team, 5);
    const hits: string[] = [];
    for (const pos of [1, 2] as const) {
      const s = soldierAt(team, pos);
      if (s) {
        hits.push(
          formatPartyHit(
            s,
            applyPartyDamage(s, 3, team.partyShield, { bypassAbsorb: true }),
          ),
        );
      }
    }
    log(`${label}: ${r}; friendly fire (ignores shield/block): ${hits.join("; ") || "nobody"}`);
    return;
  }
  // F explosion
  const hits: string[] = [];
  for (const s of livingParty(team)) {
    hits.push(
      formatPartyHit(
        s,
        applyPartyDamage(s, 3, team.partyShield, { bypassAbsorb: true }),
      ),
    );
  }
  log(`${label}: EXPLOSION (ignores shield/block)! ${hits.join("; ")}`);
}

function healer(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  if (g === "F") {
    const healed = healBoss(team, 12);
    log(`${label}: BACKLASH — boss heals ${healed}`);
    return;
  }
  if (g === "A") {
    let total = 0;
    for (const s of livingParty(team)) {
      total += healSoldier(s, 10);
      s.statuses = s.statuses.filter((st) => st.kind !== "Mark");
    }
    log(`${label}: heals party ${total} total, removes Marks`);
    return;
  }
  if (g === "B") {
    let total = 0;
    for (const s of livingParty(team).filter((x) => x.position && x.position <= 3)) {
      total += healSoldier(s, 10);
      s.statuses = s.statuses.filter((st) => st.kind !== "Mark");
    }
    log(`${label}: heals front ${total}, removes Marks`);
    return;
  }
  if (g === "C") {
    let total = 0;
    for (const s of livingParty(team).filter((x) => x.position && x.position <= 3)) {
      total += healSoldier(s, 6);
    }
    log(`${label}: heals front ${total}`);
    return;
  }
  // D
  const h = healSoldier(soldier, 8);
  log(`${label}: self-heal ${h}`);
}

function archer(
  _soldier: Soldier,
  g: Grade,
  team: TeamState,
  random: () => number,
  log: LogFn,
  label: string,
): void {
  if (g === "F") {
    const r = hitEnemies(team, 3);
    const allies = livingParty(team);
    if (allies.length) {
      const victim = allies[Math.floor(random() * allies.length)];
      const dmg = randomInt(random, 1, 2);
      const hit = applyPartyDamage(victim, dmg, team.partyShield, {
        bypassAbsorb: true,
      });
      log(
        `${label}: MISFIRE — ${r}, and ${formatPartyHit(victim, hit)} (ignores shield/block)`,
      );
    } else {
      log(`${label}: MISFIRE — ${r}`);
    }
    return;
  }
  const dmg = g === "A" ? 18 : g === "B" ? 13 : g === "C" ? 9 : 4;
  const r = hitEnemies(team, dmg);
  log(`${label}: volley ${r}`);
}

function doomcaller(
  _soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  if (!team.boss) {
    log(`${label}: no boss to curse`);
    return;
  }
  // Store curse on boss; zombie handled on death via soldier metadata
  // We encode zombie tier on a synthetic status
  const curseTable: Record<
    Grade,
    { takenMult: number; rounds: number; outgoing?: number }
  > = {
    A: { takenMult: 1.25, rounds: 3 },
    B: { takenMult: 1.15, rounds: 3 },
    C: { takenMult: 1.1, rounds: 2 },
    D: { takenMult: 1.05, rounds: 2 },
    F: { takenMult: 1, rounds: 2, outgoing: 1.1 },
  };
  const c = curseTable[g];
  if (g === "F") {
    team.boss.outgoingDamageMult = c.outgoing ?? 1.1;
    team.boss.outgoingBuffRoundsLeft = c.rounds;
    log(`${label}: harmful curse — boss hits harder for ${c.rounds} rounds`);
  } else {
    team.boss.curseDamageTakenMult = c.takenMult;
    team.boss.curseRoundsLeft = c.rounds;
    log(
      `${label}: curses boss (+${Math.round((c.takenMult - 1) * 100)}% dmg taken, ${c.rounds} rounds)`,
    );
  }
  // Tag doomcaller with zombie tier via Mark-like custom — use Weaken duration as tier code
  // Better: store on soldier as status Stun repurposed — use a Mark and track grade on team log only
  _soldier.statuses = _soldier.statuses.filter((s) => s.kind !== "Weaken");
  _soldier.statuses.push({
    kind: "Weaken",
    duration: g === "A" ? 5 : g === "B" ? 4 : g === "C" ? 3 : g === "D" ? 2 : 1,
  });
}

/** Called when a Doomcaller dies — duration on Weaken encodes tier 5=A … 1=F */
export function triggerDoomcallerDeath(
  team: TeamState,
  soldier: Soldier,
  log: LogFn,
): void {
  const tag = soldier.statuses.find((s) => s.kind === "Weaken");
  const tier = tag && tag.kind === "Weaken" ? tag.duration : 3;
  if (tier >= 5) {
    const r = hitEnemies(team, 20);
    log(`${soldier.name}'s death curse erupts: ${r}`);
  } else if (tier === 4) {
    log(`${soldier.name}'s zombie: ${hitEnemies(team, 12)}`);
  } else if (tier === 3) {
    log(`${soldier.name}'s zombie: ${hitEnemies(team, 6)}`);
  } else if (tier === 2) {
    const allies = livingParty(team);
    if (allies.length) {
      const v = allies[0];
      const hit = applyPartyDamage(v, 3, team.partyShield, { bypassAbsorb: true });
      log(`${soldier.name}'s risky zombie: ${formatPartyHit(v, hit)}`);
    }
  } else {
    const hits: string[] = [];
    for (const s of livingParty(team)) {
      hits.push(
        formatPartyHit(
          s,
          applyPartyDamage(s, 8, team.partyShield, { bypassAbsorb: true }),
        ),
      );
    }
    log(`${soldier.name}'s backfire death: ${hits.join("; ")}`);
  }
}

function necromancer(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  random: () => number,
  log: LogFn,
  label: string,
): void {
  if (g === "F") {
    if (random() < 0.5) {
      const h = healBoss(team, 8);
      log(`${label}: BACKLASH — boss heals ${h}`);
    } else {
      const hit = applyPartyDamage(soldier, 6, team.partyShield, {
        bypassAbsorb: true,
      });
      log(`${label}: BACKLASH — ${formatPartyHit(soldier, hit)}`);
    }
    return;
  }
  const table: Record<Exclude<Grade, "F">, { dmg: number; heal: number; self?: number }> = {
    A: { dmg: 12, heal: 10 },
    B: { dmg: 9, heal: 6 },
    C: { dmg: 6, heal: 3 },
    D: { dmg: 4, heal: 0, self: 3 },
  };
  const t = table[g as Exclude<Grade, "F">];
  const r = hitEnemies(team, t.dmg);
  const allies = livingParty(team).slice().sort((a, b) => a.currentHp - b.currentHp);
  let healed = 0;
  if (t.heal > 0 && allies.length) {
    healed = healSoldier(allies[0], t.heal);
  }
  if (t.self) {
    applyPartyDamage(soldier, t.self, team.partyShield, { bypassAbsorb: true });
  }
  log(`${label}: drain ${r}${healed ? `, heal ${allies[0].name} ${healed}` : ""}`);
}

function thundercaller(
  _soldier: Soldier,
  g: Grade,
  team: TeamState,
  random: () => number,
  log: LogFn,
  label: string,
): void {
  if (g === "F") {
    const hits: string[] = [];
    for (const s of livingParty(team)) {
      hits.push(
        formatPartyHit(
          s,
          applyPartyDamage(s, 5, team.partyShield, { bypassAbsorb: true }),
        ),
      );
    }
    log(`${label}: OVERLOAD (ignores shield/block) — ${hits.join("; ")}`);
    return;
  }
  if (g === "A") {
    const r = hitEnemies(team, 14, "chain", 2);
    if (team.boss && random() < 0.3) {
      team.boss.stunRoundsLeft = Math.max(team.boss.stunRoundsLeft, 1);
      log(`${label}: chain ${r}; boss stunned!`);
    } else {
      log(`${label}: chain ${r}`);
    }
    return;
  }
  if (g === "B") {
    log(`${label}: ${hitEnemies(team, 11, "chain", 1)}`);
    return;
  }
  if (g === "C") {
    log(`${label}: ${hitEnemies(team, 9)}`);
    return;
  }
  // D
  const r = hitEnemies(team, 6);
  const allies = livingParty(team);
  if (allies.length) {
    const v = allies[Math.floor(random() * allies.length)];
    const hit = applyPartyDamage(v, 3, team.partyShield, { bypassAbsorb: true });
    log(`${label}: unstable ${r}, ${formatPartyHit(v, hit)} (ignores shield/block)`);
  } else {
    log(`${label}: ${r}`);
  }
}

function runesinger(
  _soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  if (g === "A") {
    team.partyDamageBonus += 3;
    log(`${label}: powerful rune — party +3 damage this round`);
    return;
  }
  if (g === "B") {
    team.partyDamageBonus += 2;
    log(`${label}: good rune — party +2 damage`);
    return;
  }
  if (g === "C") {
    team.partyDamageBonus += 1;
    log(`${label}: basic rune — party +1 damage`);
    return;
  }
  if (g === "D") {
    log(`${label}: weak rune — self buff (minimal this round)`);
    return;
  }
  // F — boss next attack bonus
  if (team.boss) {
    team.boss.nextAttackBonus += 4;
    log(`${label}: corrupted rune — boss +4 next attack`);
  }
}
