/**
 * Full-campaign attrition / finishability balance report.
 * Usage: node scripts/playtest-campaign-attrition.mjs
 * Requires: npm run build -w @dungeon-grades/shared && npm run build -w server
 *
 * Goals to evaluate:
 * - High attrition across a full 6-room run (deaths mount)
 * - Campaign still finishable with a thin late roster (understrength OK)
 */
import {
  commitRound,
  createTeam,
  placeMagnet,
  resolveBoss,
  selectParty,
  startFight,
  enterBetweenRooms,
  returnFromDefeat,
} from "../server/dist/engine/combat.js";
import {
  chooseHealingPotionReward,
  chooseRelicReward,
} from "../server/dist/engine/rewards.js";
import { DEFAULT_ROOM_BOSSES } from "../packages/shared/dist/index.js";

const ROOM_BOSSES = [...DEFAULT_ROOM_BOSSES];

function resolveReward(team) {
  if (team.phase !== "reward") return;
  const eligible = team.roster
    .filter((soldier) => soldier.alive && !soldier.relic)
    .sort((a, b) => b.currentHp / b.maxHp - a.currentHp / a.maxHp)[0];
  const pending = team.items.pendingReward;
  const offer = pending?.relicOfferIds[
    (pending?.sourceRoomIndex ?? 0) % (pending?.relicOfferIds.length || 1)
  ];
  if (eligible && offer) {
    chooseRelicReward(team, offer, eligible.id);
    return;
  }
  const wounded = team.roster
    .filter((soldier) => soldier.alive)
    .sort((a, b) => a.currentHp / a.maxHp - b.currentHp / b.maxHp)[0];
  if (wounded) chooseHealingPotionReward(team, wounded.id);
}

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
  damageHeavy: [
    "Vanguard",
    "FireMage",
    "Archer",
    "Thundercaller",
    "Archer",
    "Healer",
  ],
  supportHeavy: [
    "Vanguard",
    "ShieldMaiden",
    "Necromancer",
    "FireMage",
    "Healer",
    "Runesinger",
  ],
};

function livingParty(team) {
  return team.roster.filter(
    (s) => s.alive && team.activePartyIds.includes(s.id),
  );
}

function livingRoster(team) {
  return team.roster.filter((s) => s.alive);
}

function isSupport(a) {
  return a === "Healer" || a === "Runesinger";
}

/**
 * Back-seat exclusivity softlocks only when every living soldier must enter
 * (understrength) or when there are not enough non-supports to fill a legal 6.
 * Bench is fine while living ≥ 6 and ≥5 non-supports remain — do not retire then.
 */
function retireExcessSupports(team) {
  const alive = livingRoster(team);
  const supports = alive.filter((s) => isSupport(s.archetype));
  if (supports.length <= 1) return 0;
  const nonSupports = alive.length - supports.length;
  const need = Math.min(6, alive.length);
  const mustRetire =
    (need < 6 && supports.length > 1) ||
    (need === 6 && nonSupports < 5);
  if (!mustRetire) return 0;
  const keep =
    supports.find((s) => s.archetype === "Runesinger") ?? supports[0];
  let retired = 0;
  for (const s of supports) {
    if (s.id === keep.id) continue;
    s.alive = false;
    s.currentHp = 0;
    retired++;
  }
  return retired;
}

/**
 * Build a legal active line.
 * - Full roster (≥6 living): preferred archetypes, at most one backline support.
 * - Understrength: every living soldier; excess supports already retired.
 */
function partyIds(team, arches) {
  const alive = livingRoster(team);
  const need = Math.min(6, alive.length);
  if (need <= 0) return [];

  const preferFront = ["Vanguard", "Spearman", "ShieldMaiden"];
  const sortFront = (list) =>
    [...list].sort((a, b) => {
      const pa = preferFront.indexOf(a.archetype);
      const pb = preferFront.indexOf(b.archetype);
      return (pa === -1 ? 9 : pa) - (pb === -1 ? 9 : pb);
    });

  const supports = alive.filter((s) => isSupport(s.archetype));
  const rest = sortFront(alive.filter((s) => !isSupport(s.archetype)));

  // Understrength: field every living (0–1 support after retirement)
  if (need < 6) {
    if (supports.length === 0) return rest.map((s) => s.id);
    return [...rest, supports[0]].map((s) => s.id);
  }

  // Full party of 6: up to 5 non-supports + optional 1 support
  const used = new Set();
  const body = [];
  for (const a of arches) {
    if (isSupport(a)) continue;
    if (body.length >= 5) break;
    const s = rest.find((x) => x.archetype === a && !used.has(x.id));
    if (!s) continue;
    used.add(s.id);
    body.push(s);
  }
  for (const s of rest) {
    if (body.length >= 5) break;
    if (used.has(s.id)) continue;
    used.add(s.id);
    body.push(s);
  }

  let support = null;
  for (const a of arches) {
    if (!isSupport(a)) continue;
    const s = supports.find((x) => x.archetype === a);
    if (s) {
      support = s;
      break;
    }
  }
  if (!support && supports.length) support = supports[0];

  // Need 6: if we have support, body max 5; else body max 6
  if (support) {
    while (body.length < 5) {
      const s = rest.find((x) => !used.has(x.id));
      if (!s) break;
      used.add(s.id);
      body.push(s);
    }
    // If still short on non-supports, pad with more non-supports only — cannot dual-support
    const line = [...body.slice(0, 5), support];
    if (line.length < 6) {
      // not enough non-supports for full legal party
      for (const s of rest) {
        if (line.length >= 6) break;
        if (line.some((x) => x.id === s.id)) continue;
        line.splice(line.length - 1, 0, s);
      }
    }
    return line.slice(0, 6).map((s) => s.id);
  }

  while (body.length < 6) {
    const s = rest.find((x) => !used.has(x.id));
    if (!s) break;
    used.add(s.id);
    body.push(s);
  }
  return body.slice(0, 6).map((s) => s.id);
}

function smartPos(team) {
  const L = livingParty(team).sort((a, b) => a.position - b.position);
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
  if (hurt) return pick("Healer", "Runesinger", "Necromancer") ?? L[0].position;
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

function fightRoom(team, bossId, pool, maxR = 60) {
  const startRosterAlive = livingRoster(team).length;
  const startPartyAlive = livingParty(team).length;
  let rounds = 0;
  while (rounds < maxR && team.phase === "awaiting_magnet") {
    let pos = smartPos(team);
    const at = livingParty(team).find((s) => s.position === pos);
    if (!at) pos = livingParty(team)[0]?.position ?? 1;
    placeMagnet(team, pos);
    commitRound(team);
    if (team.phase === "boss_telegraph") resolveBoss(team);
    rounds++;
  }
  return {
    phase: team.phase,
    rounds,
    win: team.phase === "victory",
    loss: team.phase === "defeat",
    partyAlive: livingParty(team).length,
    rosterAlive: livingRoster(team).length,
    partyDeathsThisFight: startPartyAlive - livingParty(team).length,
    rosterDeathsThisFight: startRosterAlive - livingRoster(team).length,
    bossLeft: team.boss?.currentHp ?? 0,
    bossMax: team.boss?.maxHp ?? 0,
    fielded: startPartyAlive,
  };
}

/**
 * Full campaign with limited retries on defeat (deaths persist).
 * maxRetriesPerRoom = how many extra attempts after first wipe on a room.
 */
function runCampaign(seed, arches, pool, opts = {}) {
  const {
    campaignLength = 6,
    maxRetriesPerRoom = 2,
    maxR = 60,
  } = opts;
  const team = createTeam(`camp${seed}`, "CAMP", "Bal", seed);
  const rooms = [];
  let totalRetries = 0;
  let outcome = "unknown";
  let supportsRetired = 0;

  for (let room = 0; room < campaignLength; room++) {
    const bossId = ROOM_BOSSES[room] ?? "bone_colossus";
    let attempts = 0;
    let roomResult = null;

    while (attempts <= maxRetriesPerRoom) {
      attempts++;
      supportsRetired += retireExcessSupports(team);
      const alive = livingRoster(team).length;
      if (alive === 0) {
        outcome = "wipe_no_roster";
        roomResult = {
          room: room + 1,
          bossId,
          attempts,
          phase: "no_roster",
          win: false,
          rosterAlive: 0,
          fielded: 0,
        };
        break;
      }

      try {
        const ids = partyIds(team, arches);
        if (ids.length !== Math.min(6, livingRoster(team).length)) {
          throw new Error(
            `formation short: got ${ids.length}, need ${Math.min(6, livingRoster(team).length)} living=${livingRoster(team).length}`,
          );
        }
        selectParty(team, ids);
      } catch (e) {
        outcome = `softlock: ${e.message}`;
        roomResult = {
          room: room + 1,
          bossId,
          attempts,
          phase: "softlock",
          win: false,
          error: e.message,
          rosterAlive: alive,
        };
        break;
      }

      startFight(team, bossId, [...pool]);
      const fr = fightRoom(team, bossId, pool, maxR);
      roomResult = {
        room: room + 1,
        bossId,
        attempts,
        ...fr,
      };

      if (fr.win) break;

      if (fr.loss) {
        totalRetries++;
        returnFromDefeat(team);
        if (livingRoster(team).length === 0) {
          outcome = "wipe_no_roster";
          break;
        }
        // retry same room
        continue;
      }

      // timeout
      outcome = "timeout";
      break;
    }

    rooms.push(roomResult);

    if (!roomResult?.win) {
      if (outcome === "unknown") {
        outcome = roomResult?.phase === "defeat" || roomResult?.phase === "no_roster"
          ? "campaign_wipe"
          : roomResult?.phase ?? "failed";
      }
      break;
    }

    enterBetweenRooms(team, campaignLength);
    if (team.phase === "campaign_complete") {
      outcome = "campaign_complete";
      break;
    }
    resolveReward(team);
  }

  if (outcome === "unknown" && team.phase === "campaign_complete") {
    outcome = "campaign_complete";
  }

  const finalAlive = livingRoster(team).length;
  const deathsTotal = 21 - finalAlive; // roster size 21
  return {
    seed,
    outcome,
    complete: outcome === "campaign_complete",
    roomsCleared: rooms.filter((r) => r.win).length,
    rooms,
    finalAlive,
    deathsTotal,
    totalRetries,
    supportsRetired,
    understrengthFinish: outcome === "campaign_complete" && finalAlive < 6,
    thinFinish: outcome === "campaign_complete" && finalAlive <= 3,
  };
}

function pct(n, d) {
  if (!d) return "—";
  return `${((100 * n) / d).toFixed(0)}%`;
}

function avg(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function summarize(label, runs) {
  const n = runs.length;
  const completes = runs.filter((r) => r.complete);
  const wiped = runs.filter((r) => !r.complete);
  const under = completes.filter((r) => r.understrengthFinish);
  const thin = completes.filter((r) => r.thinFinish);

  const byRoomClear = [];
  for (let i = 1; i <= 6; i++) {
    const clearedI = runs.filter((r) => r.roomsCleared >= i).length;
    byRoomClear.push({ room: i, reachRate: pct(clearedI, n) });
  }

  // Per-room first-try win among runs that attempted the room
  const roomStats = [];
  for (let i = 0; i < 6; i++) {
    const attempted = runs
      .map((r) => r.rooms.find((x) => x.room === i + 1))
      .filter(Boolean);
    const wins = attempted.filter((x) => x.win).length;
    const avgField = avg(attempted.map((x) => x.fielded ?? 0));
    const avgRosterAfter = avg(
      attempted.filter((x) => x.win).map((x) => x.rosterAlive ?? 0),
    );
    const avgAttempts = avg(attempted.map((x) => x.attempts ?? 1));
    roomStats.push({
      room: i + 1,
      boss: ROOM_BOSSES[i],
      attempts: attempted.length,
      winRate: pct(wins, attempted.length),
      avgField: avgField?.toFixed(1) ?? "—",
      avgRosterAfterWin: avgRosterAfter?.toFixed(1) ?? "—",
      avgAttempts: avgAttempts?.toFixed(2) ?? "—",
    });
  }

  const avgFinalAliveComplete = avg(completes.map((r) => r.finalAlive));
  const avgDeathsComplete = avg(completes.map((r) => r.deathsTotal));
  const avgDeathsAll = avg(runs.map((r) => r.deathsTotal));
  const avgRoomsCleared = avg(runs.map((r) => r.roomsCleared));
  const avgRetries = avg(runs.map((r) => r.totalRetries));

  // Final-alive histogram for completes
  const hist = {};
  for (const r of completes) {
    const k = String(r.finalAlive);
    hist[k] = (hist[k] ?? 0) + 1;
  }

  console.log(`\n======== ${label}  (n=${n}) ========`);
  console.log(
    `Campaign complete: ${completes.length}/${n} (${pct(completes.length, n)})`,
  );
  console.log(
    `Wipes / fails:     ${wiped.length}/${n} (${pct(wiped.length, n)})`,
  );
  console.log(
    `Avg rooms cleared: ${avgRoomsCleared?.toFixed(2) ?? "—"} / 6`,
  );
  console.log(
    `Avg retries (defeats then reform): ${avgRetries?.toFixed(2) ?? "—"}`,
  );
  console.log(
    `Among completes — avg final alive: ${avgFinalAliveComplete?.toFixed(1) ?? "—"} / 21  |  avg deaths: ${avgDeathsComplete?.toFixed(1) ?? "—"}`,
  );
  console.log(
    `All runs — avg deaths by end: ${avgDeathsAll?.toFixed(1) ?? "—"}`,
  );
  console.log(
    `Understrength finish (<6 alive): ${under.length}/${completes.length || 0} completes (${pct(under.length, completes.length || 1)})`,
  );
  console.log(
    `Thin finish (≤3 alive):          ${thin.length}/${completes.length || 0} completes (${pct(thin.length, completes.length || 1)})`,
  );
  console.log("Reach rate (cleared ≥ room N):");
  console.log(
    "  " +
      byRoomClear.map((r) => `R${r.room} ${r.reachRate}`).join("  "),
  );
  console.log("Per-room (among runs that reached it):");
  for (const rs of roomStats) {
    console.log(
      `  R${rs.room} ${String(rs.boss).padEnd(16)} win ${rs.winRate.padStart(4)}  fielded ${rs.avgField}  rosterAfterWin ${rs.avgRosterAfterWin}  avgAttempts ${rs.avgAttempts}  (n=${rs.attempts})`,
    );
  }
  if (Object.keys(hist).length) {
    console.log(
      "Final alive histogram (completes): " +
        Object.entries(hist)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([k, v]) => `${k}:${v}`)
          .join("  "),
    );
  }

  // Fail reason breakdown
  const reasons = {};
  for (const r of wiped) {
    reasons[r.outcome] = (reasons[r.outcome] ?? 0) + 1;
  }
  if (Object.keys(reasons).length) {
    console.log(
      "Fail outcomes: " +
        Object.entries(reasons)
          .map(([k, v]) => `${k}=${v}`)
          .join(", "),
    );
  }

  return {
    label,
    n,
    completeRate: completes.length / n,
    avgRoomsCleared,
    avgFinalAliveComplete,
    avgDeathsComplete,
    understrengthRate:
      completes.length > 0 ? under.length / completes.length : 0,
    thinRate: completes.length > 0 ? thin.length / completes.length : 0,
    roomStats,
    runs,
  };
}

function batchCampaign(label, arches, pool, n, opts) {
  const runs = [];
  for (let i = 1; i <= n; i++) {
    // spread seeds
    runs.push(runCampaign(i * 17 + label.length * 31, arches, pool, opts));
  }
  return summarize(label, runs);
}

console.log("=== Full campaign attrition report ===");
console.log(
  `Rooms: ${ROOM_BOSSES.join(" → ")}`,
);
console.log("Smart magnet AI | permanent deaths | understrength fielding OK");
console.log("Max 2 retries per room after defeat (deaths persist)");
console.log(
  "Note: excess Healer/Runesinger auto-retired when both alive (back-seat exclusivity softlock workaround)\n",
);

const results = [];

results.push(
  batchCampaign(
    "TYPICAL | balanced party | retries≤2",
    PARTIES.balanced,
    TYPICAL,
    24,
    { maxRetriesPerRoom: 2 },
  ),
);
results.push(
  batchCampaign(
    "TYPICAL | frontline party | retries≤2",
    PARTIES.frontline,
    TYPICAL,
    24,
    { maxRetriesPerRoom: 2 },
  ),
);
results.push(
  batchCampaign(
    "TYPICAL | damageHeavy party | retries≤2",
    PARTIES.damageHeavy,
    TYPICAL,
    20,
    { maxRetriesPerRoom: 2 },
  ),
);
results.push(
  batchCampaign(
    "TYPICAL | balanced | no retries (one-shot rooms)",
    PARTIES.balanced,
    TYPICAL,
    20,
    { maxRetriesPerRoom: 0 },
  ),
);
results.push(
  batchCampaign(
    "GENEROUS | balanced | retries≤2",
    PARTIES.balanced,
    GENEROUS,
    16,
    { maxRetriesPerRoom: 2 },
  ),
);
results.push(
  batchCampaign(
    "WEAK | balanced | retries≤2",
    PARTIES.balanced,
    WEAK,
    12,
    { maxRetriesPerRoom: 2 },
  ),
);

// Extra: if thin finish is rare, probe final-room with forced thin roster
console.log("\n======== Stress: start final room understrength ========");
function thinFinalProbe(n = 20) {
  let wins = 0;
  const survivors = [];
  for (let seed = 1; seed <= n; seed++) {
    const team = createTeam(`thin${seed}`, "THIN", "T", seed + 400);
    // Kill all but 3 varied survivors
    const keep = partyIds(team, [
      "Vanguard",
      "FireMage",
      "Healer",
    ]).slice(0, 3);
    for (const s of team.roster) {
      if (!keep.includes(s.id)) {
        s.alive = false;
        s.currentHp = 0;
      }
    }
    selectParty(team, keep);
    team.roomIndex = 5; // final room index before fight
    startFight(team, "bone_colossus", [...TYPICAL]);
    const fr = fightRoom(team, "bone_colossus", TYPICAL, 70);
    if (fr.win) {
      wins++;
      survivors.push(fr.rosterAlive);
    }
  }
  console.log(
    `Bone Colossus TYPICAL with 3 soldiers (Vg/FM/Healer): W ${wins}/${n} (${pct(wins, n)})` +
      (survivors.length
        ? `  avg survivors among wins ${avg(survivors).toFixed(1)}`
        : ""),
  );
}
thinFinalProbe(24);

// 2-soldier extreme
function twoManProbe(n = 16) {
  let wins = 0;
  for (let seed = 1; seed <= n; seed++) {
    const team = createTeam(`two${seed}`, "TWO", "T", seed + 800);
    const keep = partyIds(team, ["FireMage", "Archer"]).slice(0, 2);
    for (const s of team.roster) {
      if (!keep.includes(s.id)) {
        s.alive = false;
        s.currentHp = 0;
      }
    }
    selectParty(team, keep);
    team.roomIndex = 5;
    startFight(team, "bone_colossus", [...GENEROUS]);
    const fr = fightRoom(team, "bone_colossus", GENEROUS, 80);
    if (fr.win) wins++;
  }
  console.log(
    `Bone Colossus GENEROUS with 2 soldiers (FM/Archer): W ${wins}/${n} (${pct(wins, n)})`,
  );
}
twoManProbe(16);

console.log("\n=== Summary table ===\n");
console.log(
  [
    "label".padEnd(48),
    "clear%".padStart(7),
    "avgRms".padStart(7),
    "avgAlive".padStart(9),
    "avgDeaths".padStart(10),
    "thin%".padStart(7),
  ].join(" "),
);
for (const r of results) {
  console.log(
    [
      r.label.slice(0, 48).padEnd(48),
      pct(Math.round(r.completeRate * r.n), r.n).padStart(7),
      (r.avgRoomsCleared?.toFixed(2) ?? "—").padStart(7),
      (r.avgFinalAliveComplete?.toFixed(1) ?? "—").padStart(9),
      (r.avgDeathsComplete?.toFixed(1) ?? "—").padStart(10),
      pct(Math.round(r.thinRate * (r.n * r.completeRate || 1)), Math.max(1, Math.round(r.completeRate * r.n))).padStart(7),
    ].join(" "),
  );
}

console.log("\nDone.");
