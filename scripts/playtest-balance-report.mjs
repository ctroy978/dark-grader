/**
 * Balance sweep for fixed-front-three targeting.
 * Usage: node scripts/playtest-balance-report.mjs
 * Requires: npm run build -w server
 */
import {
  commitRound,
  createTeam,
  placeMagnet,
  resolveBoss,
  selectParty,
  startFight,
} from "../server/dist/engine/combat.js";

const GENEROUS = [
  ...Array(20).fill("A"),
  ...Array(10).fill("B"),
  "C",
  "C",
  "D",
  "F",
];
const TYPICAL =
  "A A A A B B B B B C C C C C C D D D D F F F F".split(" ");
const WEAK =
  "A A B B C C C C C C D D D D D F F F F F F F".split(" ");

const PARTIES = {
  balanced: [
    "Vanguard",
    "ShieldMaiden",
    "FireMage",
    "Healer",
    "Archer",
    "Runesinger",
  ],
  frontline: [
    "Vanguard",
    "Spearman",
    "FireMage",
    "Healer",
    "Archer",
    "ShieldMaiden",
  ],
  spearFront: [
    "Spearman",
    "Archer",
    "FireMage",
    "Healer",
    "Thundercaller",
    "Runesinger",
  ],
  glass: [
    "FireMage",
    "FireMage",
    "Archer",
    "Archer",
    "Thundercaller",
    "ShieldMaiden",
  ],
  noArcher: [
    "Vanguard",
    "Spearman",
    "FireMage",
    "Healer",
    "ShieldMaiden",
    "Runesinger",
  ],
};

function living(team) {
  return team.roster.filter(
    (s) => s.alive && team.activePartyIds.includes(s.id),
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
    (s) => s.archetype === "Healer" || s.archetype === "Lifebinder",
  );
  const rest = soldiers.filter(
    (s) => s.archetype !== "Healer" && s.archetype !== "Lifebinder",
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

function smartPos(team) {
  const L = living(team).sort((a, b) => a.position - b.position);
  if (!L.length) return 1;
  const pending = team.pendingTokens ?? [];
  const hasA = pending.includes("A");
  const dots = L.some((s) => s.statuses?.some((st) => st.kind === "Dot"));
  const hurt =
    L.reduce((a, s) => a + s.currentHp, 0) /
      Math.max(1, L.reduce((a, s) => a + s.maxHp, 0)) <
    0.55;
  const pick = (...as) => L.find((s) => as.includes(s.archetype))?.position;
  const minions = (team.minions ?? []).filter((m) => m.currentHp > 0);
  const dead = team.roster.some(
    (s) => team.activePartyIds.includes(s.id) && !s.alive,
  );
  // Prefer tanky seat under magnet when 2+ minions (they hard-focus magnet)
  if (minions.length >= 2) {
    return (
      pick("Vanguard", "Spearman", "ShieldMaiden") ??
      pick("Archer") ??
      L[0].position
    );
  }
  if (dead && hasA) return pick("Thundercaller") ?? L[0].position;
  if (minions.length)
    return pick("Archer", "Spearman", "Vanguard") ?? L[0].position;
  if (dots) return pick("FireMage", "Healer") ?? L[0].position;
  if (hurt) return pick("Healer", "Lifebinder", "Necromancer") ?? L[0].position;
  if (hasA)
    return (
      pick(
        "FireMage",
        "Thundercaller",
        "Archer",
        "Spearman",
        "Runesinger",
        "ShieldMaiden",
      ) ?? L[0].position
    );
  return (
    pick("FireMage", "Archer", "Spearman", "Thundercaller", "ShieldMaiden") ??
    L[Math.floor(L.length / 2)].position
  );
}

function afkPos(team) {
  return living(team)[0]?.position ?? 1;
}

function runFight(seed, boss, pool, arches, smart = true, maxR = 50) {
  const team = createTeam(`b${seed}`, "BAL", "Bal", seed);
  selectParty(team, partyIds(team, arches));
  // Prefer tank/spear in front when available
  const order = [...team.activePartyIds];
  const preferFront = ["Vanguard", "Spearman", "ShieldMaiden"];
  order.sort((a, b) => {
    const sa = team.roster.find((s) => s.id === a);
    const sb = team.roster.find((s) => s.id === b);
    const pa = preferFront.indexOf(sa?.archetype ?? "");
    const pb = preferFront.indexOf(sb?.archetype ?? "");
    const ra = pa === -1 ? 9 : pa;
    const rb = pb === -1 ? 9 : pb;
    return ra - rb;
  });
  // re-select to set positions 1..6 by order
  selectParty(team, order);

  startFight(team, boss, [...pool]);
  const startHp = team.boss.currentHp;
  let rounds = 0;
  let deaths = 0;
  const startAlive = living(team).length;

  while (rounds < maxR && team.phase === "awaiting_magnet") {
    let pos = smart ? smartPos(team) : afkPos(team);
    // Clamp magnet to living seat
    const at = living(team).find((s) => s.position === pos);
    if (!at) pos = living(team)[0]?.position ?? 1;
    placeMagnet(team, pos);
    commitRound(team);
    if (team.phase === "boss_telegraph") resolveBoss(team);
    const nowAlive = living(team).length;
    if (nowAlive < startAlive - deaths) {
      deaths = startAlive - nowAlive;
    }
    rounds++;
  }

  const phase = team.phase;
  const bossLeft = team.boss?.currentHp ?? 0;
  const livingN = living(team).length;
  return {
    seed,
    boss,
    phase,
    rounds,
    livingN,
    deaths: startAlive - livingN,
    bossLeft,
    dmgDealt: startHp - bossLeft,
    win: phase === "victory",
    loss: phase === "defeat",
  };
}

function batch(label, arches, pool, boss, n = 20, smart = true) {
  const rows = [];
  for (let i = 1; i <= n; i++) {
    rows.push(runFight(i + label.length * 13, boss, pool, arches, smart));
  }
  const wins = rows.filter((r) => r.win).length;
  const losses = rows.filter((r) => r.loss).length;
  const timeouts = n - wins - losses;
  const winRows = rows.filter((r) => r.win);
  const lossRows = rows.filter((r) => r.loss);
  const avgR = (xs) =>
    xs.length ? (xs.reduce((a, r) => a + r.rounds, 0) / xs.length).toFixed(1) : "—";
  const avgLive = (
    rows.reduce((a, r) => a + r.livingN, 0) / rows.length
  ).toFixed(1);
  const avgDeaths = (
    rows.reduce((a, r) => a + r.deaths, 0) / rows.length
  ).toFixed(1);
  const avgBossLeft =
    lossRows.length > 0
      ? (
          lossRows.reduce((a, r) => a + r.bossLeft, 0) / lossRows.length
        ).toFixed(0)
      : "—";
  console.log(
    [
      label.padEnd(42),
      `W ${String(wins).padStart(2)}/${n}`,
      `L ${losses}`,
      timeouts ? `T ${timeouts}` : "   ",
      `avgR ${avgR(winRows).padStart(4)}`,
      `survivors ${avgLive}`,
      `deaths ${avgDeaths}`,
      `lossBossHP ${String(avgBossLeft).padStart(4)}`,
    ].join("  "),
  );
  return { wins, losses, timeouts, n, rows };
}

console.log("=== Front-three targeting balance report ===\n");
console.log("Smart magnet | typical pool (classroom-ish)\n");

const bosses = [
  "moss_grub",
  "ash_wraith",
  "cinder_herald",
  "rattle_captain",
  "barrow_warden",
  "bone_colossus",
];

for (const boss of bosses) {
  console.log(`--- ${boss} ---`);
  batch(`${boss} balanced typical`, PARTIES.balanced, TYPICAL, boss, 20);
  batch(`${boss} frontline typical`, PARTIES.frontline, TYPICAL, boss, 20);
  batch(`${boss} glass typical`, PARTIES.glass, TYPICAL, boss, 16);
  console.log("");
}

console.log("=== Add rooms: no Archer stress ===\n");
batch("herald noArcher typical", PARTIES.noArcher, TYPICAL, "cinder_herald", 20);
batch("colo noArcher typical", PARTIES.noArcher, TYPICAL, "bone_colossus", 16);
batch("colo spearFront typical", PARTIES.spearFront, TYPICAL, "bone_colossus", 20);

console.log("\n=== Pool strength (balanced party, Ash) ===\n");
batch("Ash balanced GENEROUS", PARTIES.balanced, GENEROUS, "ash_wraith", 16);
batch("Ash balanced TYPICAL", PARTIES.balanced, TYPICAL, "ash_wraith", 20);
batch("Ash balanced WEAK", PARTIES.balanced, WEAK, "ash_wraith", 20);

console.log("\n=== AFK magnet (park pos1) vs smart ===\n");
batch("Ash AFK typical", PARTIES.balanced, TYPICAL, "ash_wraith", 16, false);
batch("Ash smart typical", PARTIES.balanced, TYPICAL, "ash_wraith", 16, true);
batch("Colo AFK typical", PARTIES.frontline, TYPICAL, "bone_colossus", 12, false);
batch("Colo smart typical", PARTIES.frontline, TYPICAL, "bone_colossus", 12, true);

console.log("\n=== Colossus generous pool ===\n");
batch("Colo balanced GENEROUS", PARTIES.balanced, GENEROUS, "bone_colossus", 16);
batch("Colo frontline GENEROUS", PARTIES.frontline, GENEROUS, "bone_colossus", 16);
batch("Colo glass GENEROUS", PARTIES.glass, GENEROUS, "bone_colossus", 12);

console.log("\nDone.");
