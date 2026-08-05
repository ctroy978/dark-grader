/**
 * Paired-seed boss balance matrix.
 *
 * Runs every boss against several party shapes and grade pools, then prints
 * Markdown tables suitable for a tuning report.
 *
 * Usage:
 *   npm run build -w @dungeon-grades/shared
 *   npm run build -w server
 *   node scripts/playtest-boss-matrix.mjs [--runs 100] [--max-rounds 80]
 *     [--bosses rattle_captain,barrow_warden] [--pools Typical]
 *     [--parties Balanced,Frontline]
 */
import {
  commitRound,
  createTeam,
  placeMagnet,
  resolveBoss,
  selectParty,
  startFight,
} from "../server/dist/engine/combat.js";
import { loadBossTemplates } from "../server/dist/seed/bosses.js";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i], process.argv[i + 1]);
}
const RUNS = Number.parseInt(args.get("--runs") ?? "100", 10);
const MAX_ROUNDS = Number.parseInt(args.get("--max-rounds") ?? "80", 10);
if (!Number.isInteger(RUNS) || RUNS < 1) throw new Error("--runs must be a positive integer");
if (!Number.isInteger(MAX_ROUNDS) || MAX_ROUNDS < 1) {
  throw new Error("--max-rounds must be a positive integer");
}

const ALL_POOLS = {
  Strong: [...Array(20).fill("A"), ...Array(10).fill("B"), "C", "C", "D", "F"],
  Typical: "A A A A B B B B B C C C C C C D D D D F F F F".split(" "),
  Weak: "A A B B C C C C C C D D D D D F F F F F F F".split(" "),
};

// Array order is combat position 1 -> 6. Together these parties exercise every
// archetype and deliberately include high-defense, high-damage, and low-damage
// shapes instead of six small variations on the same balanced core.
const ALL_PARTIES = {
  Balanced: ["Vanguard", "ShieldMaiden", "FireMage", "Archer", "Thundercaller", "Healer"],
  Frontline: ["Vanguard", "Spearman", "ShieldMaiden", "FireMage", "Archer", "Healer"],
  Glass: ["ShieldMaiden", "FireMage", "FireMage", "Archer", "Archer", "Thundercaller"],
  Sustain: ["Vanguard", "ShieldMaiden", "Necromancer", "Thundercaller", "Archer", "Healer"],
  Specialists: ["Spearman", "FireMage", "Archer", "Necromancer", "Thundercaller", "Runesinger"],
};

const BOSS_ORDER = [
  "moss_grub",
  "ash_wraith",
  "cinder_herald",
  "rattle_captain",
  "barrow_warden",
  "bone_colossus",
];

function selectedEntries(all, flag) {
  const requested = args.get(flag)?.split(",").filter(Boolean);
  if (!requested?.length) return Object.entries(all);
  for (const name of requested) {
    if (!(name in all)) throw new Error(`Unknown ${flag} value: ${name}`);
  }
  return requested.map((name) => [name, all[name]]);
}

const bossIds = args.get("--bosses")?.split(",").filter(Boolean) ?? BOSS_ORDER;
const bosses = loadBossTemplates()
  .filter((boss) => bossIds.includes(boss.id))
  .sort((a, b) => bossIds.indexOf(a.id) - bossIds.indexOf(b.id));
for (const bossId of bossIds) {
  if (!bosses.some((boss) => boss.id === bossId)) throw new Error(`Unknown boss: ${bossId}`);
}
const POOLS = Object.fromEntries(selectedEntries(ALL_POOLS, "--pools"));
const PARTIES = Object.fromEntries(selectedEntries(ALL_PARTIES, "--parties"));

function active(team) {
  return team.roster
    .filter((s) => s.alive && team.activePartyIds.includes(s.id))
    .sort((a, b) => a.position - b.position);
}

function exactPartyIds(team, archetypes) {
  const used = new Set();
  return archetypes.map((archetype) => {
    const soldier = team.roster.find(
      (s) => s.archetype === archetype && s.alive && !used.has(s.id),
    );
    if (!soldier) throw new Error(`Roster cannot supply ${archetypes.join(", ")}`);
    used.add(soldier.id);
    return soldier.id;
  });
}

/**
 * One generic, boss-agnostic classroom policy. It reacts only to visible board
 * state and the telegraphed grade drop: protect against focused adds, thaw,
 * resurrect, cleanse, heal, then favor damage. This is intentionally not an
 * oracle for the boss's next (still hidden) attack.
 */
function adaptiveMagnetPosition(team) {
  const living = active(team);
  if (!living.length) return 1;
  const pick = (...archetypes) =>
    living.find((s) => archetypes.includes(s.archetype))?.position;
  const pending = team.pendingTokens ?? [];
  const hasA = pending.includes("A");
  const hasAB = hasA || pending.includes("B");
  const liveAdds = (team.minions ?? []).filter((m) => m.currentHp > 0 && !m.memory);
  const frozen = living.find((s) => s.statuses.some((st) => st.kind === "Frozen"));
  const dotted = living.some((s) => s.statuses.some((st) => st.kind === "Dot"));
  const dead = team.roster.some(
    (s) => team.activePartyIds.includes(s.id) && !s.alive,
  );
  const hpRatio =
    living.reduce((sum, s) => sum + s.currentHp, 0) /
    Math.max(1, living.reduce((sum, s) => sum + s.maxHp, 0));

  // Two adds focus the magnet hard; make a durable claimant hold that pressure.
  if (liveAdds.length >= 2) {
    return pick("Vanguard", "Spearman", "ShieldMaiden") ?? living[0].position;
  }
  if (frozen && hasA) return frozen.position;
  if (dead && hasA) return pick("Thundercaller") ?? living[0].position;
  if (dotted && hasAB) return pick("FireMage", "Healer") ?? living[0].position;
  if (hpRatio < 0.62 && hasAB) {
    return pick("Healer", "Runesinger", "Necromancer") ?? living[0].position;
  }
  if (liveAdds.length) {
    return pick("Archer", "FireMage", "Spearman", "Vanguard") ?? living[0].position;
  }
  if (hasA) {
    return (
      pick("FireMage", "Thundercaller", "Archer", "Spearman", "Runesinger") ??
      living[0].position
    );
  }
  if (pending.includes("C")) {
    return pick("Runesinger", "Vanguard", "ShieldMaiden") ?? living[0].position;
  }
  return (
    pick("Vanguard", "ShieldMaiden", "Spearman", "Archer", "FireMage") ??
    living[0].position
  );
}

function hpSnapshot(team) {
  return {
    soldiers: new Map(
      team.roster
        .filter((s) => team.activePartyIds.includes(s.id))
        .map((s) => [s.id, s.currentHp]),
    ),
    boss: team.boss?.currentHp ?? 0,
    minions: new Map((team.minions ?? []).map((m) => [m.id, m.currentHp])),
  };
}

function applyHpDelta(metrics, before, after, stage) {
  for (const [id, oldHp] of before.soldiers) {
    const newHp = after.soldiers.get(id) ?? oldHp;
    const delta = oldHp - newHp;
    if (delta > 0) {
      metrics.partyHpLost += delta;
      metrics[stage === "party" ? "partyPhaseHpLost" : "enemyPhaseHpLost"] += delta;
    } else if (delta < 0) {
      metrics.partyHpHealed -= delta;
    }
  }
  const bossDelta = before.boss - after.boss;
  if (bossDelta > 0) metrics.bossHpDamaged += bossDelta;
  else if (bossDelta < 0) metrics.bossHpHealed -= bossDelta;

  for (const [id, oldHp] of before.minions) {
    const newHp = after.minions.get(id);
    if (newHp !== undefined && oldHp > newHp) metrics.addHpDamaged += oldHp - newHp;
  }
}

function recordPhaseHp(metrics, team, before, stage) {
  let cursor = before;
  for (const cue of team.playback ?? []) {
    if (!cue.reveal) continue;
    const reveal = {
      soldiers: new Map(cue.reveal.soldiers.map((s) => [s.id, s.currentHp])),
      boss: cue.reveal.boss?.currentHp ?? cursor.boss,
      minions: new Map(cue.reveal.minions.map((m) => [m.id, m.currentHp])),
    };
    applyHpDelta(metrics, cursor, reveal, stage);
    cursor = reveal;
  }
  // Reconcile mechanics that intentionally do not emit a reveal cue.
  applyHpDelta(metrics, cursor, hpSnapshot(team), stage);
}

function trackNewAdds(team, seen, metrics) {
  for (const minion of team.minions ?? []) {
    if (seen.has(minion.id)) continue;
    seen.add(minion.id);
    metrics.addsSpawned += 1;
    if (minion.memory) metrics.memoriesSpawned += 1;
  }
  const livingAdds = (team.minions ?? []).filter((m) => m.currentHp > 0).length;
  metrics.peakAdds = Math.max(metrics.peakAdds, livingAdds);
}

function countFx(team, fx) {
  return (team.playback ?? []).filter((cue) => cue.fx?.includes(fx)).length;
}

function emptyMetrics() {
  return {
    rounds: 0,
    partyHpLost: 0,
    partyPhaseHpLost: 0,
    enemyPhaseHpLost: 0,
    partyHpHealed: 0,
    bossHpDamaged: 0,
    bossHpHealed: 0,
    addHpDamaged: 0,
    addsSpawned: 0,
    memoriesSpawned: 0,
    peakAdds: 0,
    dotSeatRounds: 0,
    stunSeatRounds: 0,
    frozenSeatRounds: 0,
    bossStunSkips: 0,
    enrageRounds: 0,
    deathEvents: 0,
    memoryDetonations: 0,
    memoryBreaks: 0,
  };
}

function runFight(seed, bossId, pool, partyArchetypes) {
  const team = createTeam(`matrix-${seed}`, "MATRIX", "Matrix", seed);
  selectParty(team, exactPartyIds(team, partyArchetypes));
  startFight(team, bossId, [...pool]);
  const metrics = emptyMetrics();
  const seenAdds = new Set();
  trackNewAdds(team, seenAdds, metrics);

  while (team.phase === "awaiting_magnet" && metrics.rounds < MAX_ROUNDS) {
    let position = adaptiveMagnetPosition(team);
    if (!active(team).some((s) => s.position === position)) {
      position = active(team)[0]?.position ?? 1;
    }
    if ((team.magnetStunRoundsLeft ?? 0) === 0) placeMagnet(team, position);

    let before = hpSnapshot(team);
    commitRound(team);
    metrics.rounds += 1;
    recordPhaseHp(metrics, team, before, "party");
    metrics.deathEvents += countFx(team, "death");
    metrics.memoryBreaks += countFx(team, "memory-shatter");
    trackNewAdds(team, seenAdds, metrics);

    if (team.phase !== "boss_telegraph") continue;
    const stunned = (team.boss?.stunRoundsLeft ?? 0) > 0;
    const enraged =
      !!team.boss &&
      (team.boss.enrageDamageMult ?? 1) > 1 &&
      team.boss.currentHp / team.boss.maxHp <= (team.boss.enrageHpPct ?? 0);
    if (stunned) metrics.bossStunSkips += 1;
    if (enraged && !stunned) metrics.enrageRounds += 1;

    before = hpSnapshot(team);
    resolveBoss(team);
    recordPhaseHp(metrics, team, before, "enemy");
    metrics.deathEvents += countFx(team, "death");
    metrics.memoryDetonations += countFx(team, "memory-detonate");
    trackNewAdds(team, seenAdds, metrics);

    for (const soldier of active(team)) {
      if (soldier.statuses.some((st) => st.kind === "Dot")) metrics.dotSeatRounds += 1;
      if (soldier.statuses.some((st) => st.kind === "Stun")) metrics.stunSeatRounds += 1;
      if (soldier.statuses.some((st) => st.kind === "Frozen")) metrics.frozenSeatRounds += 1;
    }
  }

  const living = active(team).length;
  const phase = team.phase;
  return {
    ...metrics,
    seed,
    phase,
    win: phase === "victory",
    loss: phase === "defeat",
    timeout: phase !== "victory" && phase !== "defeat",
    living,
    finalDeaths: 6 - living,
    bossHpLeft: team.boss?.currentHp ?? 0,
    bossMaxHp: team.boss?.maxHp ?? 1,
  };
}

function mean(rows, value) {
  return rows.length ? rows.reduce((sum, row) => sum + value(row), 0) / rows.length : null;
}

function summarize(rows) {
  const wins = rows.filter((r) => r.win);
  const losses = rows.filter((r) => r.loss);
  const failures = rows.filter((r) => !r.win);
  const totalRounds = rows.reduce((sum, r) => sum + r.rounds, 0);
  return {
    n: rows.length,
    wins: wins.length,
    losses: losses.length,
    timeouts: rows.filter((r) => r.timeout).length,
    winPct: (100 * wins.length) / rows.length,
    winRounds: mean(wins, (r) => r.rounds),
    lossRounds: mean(losses, (r) => r.rounds),
    deaths: mean(rows, (r) => r.finalDeaths),
    lossBossPct: mean(failures, (r) => (100 * r.bossHpLeft) / r.bossMaxHp),
    hpLostPerRound:
      rows.reduce((sum, r) => sum + r.partyHpLost, 0) / Math.max(1, totalRounds),
    enemyHpLostPerRound:
      rows.reduce((sum, r) => sum + r.enemyPhaseHpLost, 0) / Math.max(1, totalRounds),
    hazardHpLostPerRound:
      rows.reduce((sum, r) => sum + r.partyPhaseHpLost, 0) / Math.max(1, totalRounds),
    healedPerFight: mean(rows, (r) => r.partyHpHealed),
    addsPerFight: mean(rows, (r) => r.addsSpawned),
    dotPerFight: mean(rows, (r) => r.dotSeatRounds),
    stunPerFight: mean(rows, (r) => r.stunSeatRounds),
    frozenPerFight: mean(rows, (r) => r.frozenSeatRounds),
    enragePerFight: mean(rows, (r) => r.enrageRounds),
    memoryDetonations: mean(rows, (r) => r.memoryDetonations),
    memoryBreaks: mean(rows, (r) => r.memoryBreaks),
  };
}

function fmt(value, digits = 1) {
  return value === null || Number.isNaN(value) ? "—" : value.toFixed(digits);
}

function pct(value) {
  return value === null || Number.isNaN(value) ? "—" : `${value.toFixed(0)}%`;
}

function outcome(summary) {
  const extra = [];
  if (summary.losses) extra.push(`${summary.losses}L`);
  if (summary.timeouts) extra.push(`${summary.timeouts}T`);
  return `${summary.wins}/${summary.n}${extra.length ? ` (${extra.join(", ")})` : ""}`;
}

const cells = [];
for (const boss of bosses) {
  for (const [poolName, pool] of Object.entries(POOLS)) {
    for (const [partyName, party] of Object.entries(PARTIES)) {
      const rows = [];
      for (let seed = 1; seed <= RUNS; seed += 1) {
        rows.push(runFight(seed, boss.id, pool, party));
      }
      cells.push({ boss, poolName, partyName, rows, summary: summarize(rows) });
    }
  }
}

console.log(`# Boss balance matrix (${RUNS} seeds per scenario)`);
console.log("");
console.log(`Max ${MAX_ROUNDS} rounds; identical seeds 1–${RUNS} in every scenario.`);
console.log("");
console.log("## Grade pools");
console.log("");
console.log("| Pool | A | B | C | D | F | Total |");
console.log("|---|---:|---:|---:|---:|---:|---:|");
for (const [name, pool] of Object.entries(POOLS)) {
  const count = (grade) => pool.filter((g) => g === grade).length;
  console.log(`| ${name} | ${count("A")} | ${count("B")} | ${count("C")} | ${count("D")} | ${count("F")} | ${pool.length} |`);
}
console.log("");
console.log("## Parties");
console.log("");
console.log("| Party | Positions 1 → 6 |");
console.log("|---|---|");
for (const [name, party] of Object.entries(PARTIES)) console.log(`| ${name} | ${party.join(", ")} |`);

for (const boss of bosses) {
  const bossCells = cells.filter((cell) => cell.boss.id === boss.id);
  console.log("");
  console.log(`## ${boss.name}`);
  console.log("");
  console.log(`Config: ${boss.maxHp} HP; ${boss.difficulty}; recommended ${boss.recommendedRounds} rounds; enrage ${Math.round(boss.enrageHpPct * 100)}% ×${boss.enrageDamageMult.toFixed(2)}.`);
  console.log("");
  console.log("| Pool | Party | Wins | Win % | Win rds | Loss rds | Deaths | Fail boss HP % | HP lost/r | Heal/f | Adds/f | DoT/Stun/Frozen seat-rds/f |");
  console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const cell of bossCells) {
    const s = cell.summary;
    console.log(`| ${cell.poolName} | ${cell.partyName} | ${outcome(s)} | ${pct(s.winPct)} | ${fmt(s.winRounds)} | ${fmt(s.lossRounds)} | ${fmt(s.deaths)} | ${pct(s.lossBossPct)} | ${fmt(s.hpLostPerRound)} | ${fmt(s.healedPerFight)} | ${fmt(s.addsPerFight)} | ${fmt(s.dotPerFight)}/${fmt(s.stunPerFight)}/${fmt(s.frozenPerFight)} |`);
  }
  if (boss.id === "bone_colossus") {
    console.log("");
    console.log("| Pool | Party | Memories broken/f | Memories detonated/f | Enraged rounds/f |");
    console.log("|---|---|---:|---:|---:|");
    for (const cell of bossCells) {
      const s = cell.summary;
      console.log(`| ${cell.poolName} | ${cell.partyName} | ${fmt(s.memoryBreaks)} | ${fmt(s.memoryDetonations)} | ${fmt(s.enragePerFight)} |`);
    }
  }
}

console.log("");
console.log("## Metric key");
console.log("");
console.log("- **Wins:** victories/runs, followed by loss and timeout counts when nonzero.");
console.log("- **Win/Loss rds:** mean rounds to that terminal result; timeout rounds are excluded.");
console.log("- **Deaths:** mean final fallen party members (revived members count as alive if they finish alive).");
console.log("- **Fail boss HP %:** mean boss health remaining across losses and timeouts.");
console.log("- **HP lost/r:** actual party HP removed per played round, after shields/block; includes boss/add pressure, DoTs, reflect, and party backfires.");
console.log("- **Heal/f:** actual party HP restored per fight, capped by missing HP.");
console.log("- **Adds/f:** spawned units including opening adds and Bone Memories.");
console.log("- **DoT/Stun/Frozen:** occupied party seat-rounds per fight after enemy phases.");
