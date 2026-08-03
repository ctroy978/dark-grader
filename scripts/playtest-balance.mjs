import {
  commitRound,
  createTeam,
  placeMagnet,
  resolveBoss,
  selectParty,
  startFight,
} from "../server/dist/engine/combat.js";
import { loadBossTemplates } from "../server/dist/seed/bosses.js";

const tpls = loadBossTemplates();
for (const t of tpls) {
  console.log(
    t.id,
    "hp",
    t.maxHp,
    "traits",
    t.traits,
    "attacks",
    (t.attacks ?? []).map((a) => a.id),
  );
}

function partyIds(team, arches) {
  const used = new Set();
  const ids = [];
  for (const a of arches) {
    const s = team.roster.find(
      (x) => x.archetype === a && !used.has(x.id) && x.alive,
    );
    if (s) {
      ids.push(s.id);
      used.add(s.id);
    }
  }
  while (ids.length < 6) {
    const s = team.roster.find((x) => x.alive && !used.has(x.id));
    if (!s) break;
    ids.push(s.id);
    used.add(s.id);
  }
  const soldiers = ids
    .map((id) => team.roster.find((x) => x.id === id))
    .filter(Boolean);
  const supports = soldiers.filter(
    (s) => s.archetype === "Healer" || s.archetype === "Runesinger",
  );
  const rest = soldiers.filter(
    (s) => s.archetype !== "Healer" && s.archetype !== "Runesinger",
  );
  if (supports.length === 0) return ids;
  const ordered = [...rest, supports[supports.length - 1]];
  while (ordered.length < 6) {
    const s = team.roster.find(
      (x) => x.alive && !ordered.some((o) => o.id === x.id),
    );
    if (!s) break;
    ordered.splice(ordered.length - 1, 0, s);
  }
  return ordered.slice(0, 6).map((s) => s.id);
}

// Count minions-after-stun
let stunRounds = 0,
  withMinions = 0,
  without = 0;
for (let seed = 1; seed <= 80; seed++) {
  const team = createTeam(`s${seed}`, "X", "T", seed);
  selectParty(
    team,
    partyIds(team, [
      "Thundercaller",
      "Thundercaller",
      "FireMage",
      "Archer",
      "ShieldMaiden",
      "Vanguard",
    ]),
  );
  startFight(team, "bone_colossus", Array(30).fill("A"));
  for (let r = 0; r < 8 && team.phase === "awaiting_magnet"; r++) {
    const th = team.roster.find(
      (s) =>
        s.alive &&
        s.archetype === "Thundercaller" &&
        team.activePartyIds.includes(s.id),
    );
    placeMagnet(team, th?.position ?? 1);
    commitRound(team);
    if (
      team.phase === "boss_telegraph" &&
      (team.boss.stunRoundsLeft ?? 0) > 0
    ) {
      stunRounds++;
      const minBefore = team.minions.filter((m) => m.currentHp > 0).length;
      resolveBoss(team);
      const minionCues = team.playback.filter((c) => c.kind === "minion").length;
      if (minionCues > 0) withMinions++;
      else without++;
      if (stunRounds <= 4)
        console.log({ seed, r, minBefore, minionCues, kinds: team.playback.map((c) => c.kind) });
    } else if (team.phase === "boss_telegraph") resolveBoss(team);
    if (team.phase !== "awaiting_magnet") break;
  }
}
console.log({ stunRounds, withMinions, without });

function sim(seed, arches, pool, boss = "ash_wraith") {
  const team = createTeam(`a${seed}`, "A", "A", seed);
  selectParty(team, partyIds(team, arches));
  startFight(team, boss, pool);
  let partyDmgDealt = 0;
  let bossHits = 0;
  while (team.phase === "awaiting_magnet") {
    const living = team.roster.filter(
      (s) => s.alive && team.activePartyIds.includes(s.id),
    );
    if (!living.length) break;
    const pending = team.pendingTokens || [];
    let pos = living[0].position;
    if (pending.includes("A"))
      pos =
        living.find((s) =>
          ["FireMage", "Thundercaller", "Archer"].includes(s.archetype),
        )?.position ?? pos;
    else if (
      living.reduce((a, s) => a + s.currentHp, 0) /
        living.reduce((a, s) => a + s.maxHp, 0) <
      0.6
    )
      pos =
        living.find((s) => ["Healer", "Runesinger"].includes(s.archetype))
          ?.position ?? pos;
    placeMagnet(team, pos);
    const preBoss = team.boss.currentHp;
    commitRound(team);
    partyDmgDealt += preBoss - (team.boss?.currentHp ?? 0);
    if (team.phase === "boss_telegraph") {
      bossHits++;
      resolveBoss(team);
    }
  }
  return {
    phase: team.phase,
    rounds: team.round,
    bossLeft: team.boss?.currentHp,
    partyDmgDealt,
    bossHits,
    living: team.roster.filter(
      (s) => s.alive && team.activePartyIds.includes(s.id),
    ).length,
  };
}

const TYPICAL =
  "A A A A B B B B B C C C C C C D D D D F F F F".split(" ");
const GENEROUS = [
  ...Array(20).fill("A"),
  ...Array(10).fill("B"),
  "C",
  "C",
  "D",
  "F",
];

function batch(label, arches, pool, boss, n = 10) {
  const rows = [];
  for (let i = 1; i <= n; i++) rows.push(sim(i + label.length * 17, arches, pool, boss));
  const wins = rows.filter((r) => r.phase === "victory").length;
  const avgDmg =
    rows.reduce((a, r) => a + r.partyDmgDealt, 0) / rows.length;
  const avgRounds =
    rows.reduce((a, r) => a + r.rounds, 0) / rows.length;
  console.log(
    label,
    `wins ${wins}/${n}`,
    `avgDmg ${avgDmg.toFixed(0)}`,
    `avgR ${avgRounds.toFixed(1)}`,
    "bossLeft on loss",
    rows.filter((r) => r.phase === "defeat").map((r) => r.bossLeft),
  );
}

const bal = [
  "Vanguard",
  "ShieldMaiden",
  "FireMage",
  "Healer",
  "Archer",
  "Runesinger",
];
const nofm = [
  "Vanguard",
  "ShieldMaiden",
  "Thundercaller",
  "Healer",
  "Archer",
  "Runesinger",
];
const glass = [
  "FireMage",
  "FireMage",
  "Archer",
  "Archer",
  "Thundercaller",
  "ShieldMaiden",
];
const doom = [
  "Spearman",
  "FireMage",
  "Healer",
  "Vanguard",
  "Archer",
  "Thundercaller",
];

batch("Balanced Ash typical", bal, TYPICAL, "ash_wraith", 12);
batch("NoFM Ash typical", nofm, TYPICAL, "ash_wraith", 12);
batch("Glass Ash typical", glass, TYPICAL, "ash_wraith", 12);
batch("Doom Ash typical", doom, TYPICAL, "ash_wraith", 12);
batch("Balanced Ash generous", bal, GENEROUS, "ash_wraith", 8);
batch("Glass Colo generous", glass, GENEROUS, "bone_colossus", 8);
batch("Balanced Colo generous", bal, GENEROUS, "bone_colossus", 8);

// Average damage per token claim (approx) - first round only many seeds
let totalDmg = 0,
  n = 0;
for (let seed = 1; seed <= 40; seed++) {
  const team = createTeam(`d${seed}`, "D", "D", seed);
  selectParty(team, partyIds(team, bal));
  startFight(team, "ash_wraith", TYPICAL);
  placeMagnet(team, 3);
  const pre = team.boss.currentHp;
  commitRound(team);
  totalDmg += pre - team.boss.currentHp;
  n++;
}
console.log("Avg party-phase boss dmg R1 balanced:", (totalDmg / n).toFixed(1));
