/**
 * In-process engine playtest (no HTTP). Uses built server dist.
 */
import {
  commitRound,
  createTeam,
  placeMagnet,
  resolveBoss,
  selectParty,
  startFight,
  enterBetweenRooms,
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

function living(team) {
  return team.roster.filter(
    (s) => s.alive && team.activePartyIds.includes(s.id),
  );
}
function livingRoster(team) {
  return team.roster.filter((s) => s.alive);
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
  // Healer/Runesinger only in back seat; at most one support
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
    // insert before support
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
      L.reduce((a, s) => a + s.maxHp, 0) <
    0.55;
  const pick = (...as) => L.find((s) => as.includes(s.archetype))?.position;
  const minions = (team.minions ?? []).filter((m) => m.currentHp > 0);
  const dead = (team.roster ?? []).some(
    (s) => team.activePartyIds?.includes(s.id) && !s.alive,
  );
  if (dead && hasA) return pick("Thundercaller") ?? L[0].position;
  if (minions.length)
    return pick("Archer", "Spearman", "Vanguard") ?? L[0].position;
  if (dots) return pick("FireMage", "Healer") ?? L[0].position;
  if (hurt)
    return pick("Healer", "Runesinger", "Necromancer") ?? L[0].position;
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

function runFight(seed, boss, pool, arches, maxR = 60) {
  const team = createTeam(`t${seed}`, "CODE", "T", seed);
  selectParty(team, partyIds(team, arches));
  startFight(team, boss, pool);
  const startHp = team.boss.currentHp;
  let rounds = 0;
  const issueCounts = {};
  const issueSamples = [];
  const add = (i, extra) => {
    issueCounts[i] = (issueCounts[i] || 0) + 1;
    if (issueSamples.length < 20)
      issueSamples.push({ round: rounds + 1, i, extra });
  };

  while (rounds < maxR && team.phase === "awaiting_magnet") {
    placeMagnet(team, smartPos(team));
    const preLog = team.log.length;
    commitRound(team);
    const partyLog = team.log.slice(preLog).map((l) => l.text);

    const mag = team.roster.find(
      (s) =>
        s.position === team.magnetPosition &&
        team.activePartyIds.includes(s.id),
    );
    if (
      mag?.alive &&
      team.lastClaims?.length &&
      !team.lastClaims.some((c) => c.soldierId === mag.id)
    ) {
      add("MAGNET_MISS");
    }
    for (const c of team.playback ?? []) {
      if (
        ["action", "boss", "minion", "hurt", "dot", "death"].includes(c.kind) &&
        !c.reveal
      )
        add(`NO_REVEAL:${c.kind}`);
      if (c.kind === "action") {
        const arch = team.roster.find(
          (s) => s.id === c.focusIds?.[0],
        )?.archetype;
        if (
          arch === "Healer" &&
          c.grade === "F" &&
          (c.fx ?? []).includes("heal-glow")
        )
          add("HEALER_F_HEAL_GLOW");
        if (
          arch === "Runesinger" &&
          c.grade === "F" &&
          (c.fx ?? []).includes("heal-glow")
        )
          add("RUNESINGER_F_HEAL_GLOW");
      }
    }
    const claims = (team.playback ?? []).filter((c) => c.kind === "claim")
      .length;
    const actions = (team.playback ?? []).filter((c) => c.kind === "action")
      .length;
    const stunLogs = partyLog.filter((t) => /STUNNED/i.test(t));
    if (claims !== actions && claims > 0) {
      if (claims !== actions + stunLogs.length)
        add("CLAIM_ACTION_MISMATCH", {
          claims,
          actions,
          stuns: stunLogs.length,
          logs: partyLog.filter((t) => /claim|STUN/i.test(t)).slice(0, 6),
        });
      else if (stunLogs.length)
        add("STUN_NO_ACTION_CUE", { n: stunLogs.length });
    }
    // Dead claimers?
    for (const c of team.lastClaims ?? []) {
      // action may still fire for dead? checked at resolve
    }

    const acts = (team.playback ?? []).filter((c) => c.kind === "action");
    const archs = acts.map(
      (c) => team.roster.find((s) => s.id === c.focusIds?.[0])?.archetype,
    );
    if (archs.indexOf("Runesinger") > 0) add("RS_NOT_FIRST", archs);

    // Shield maiden F with no shield still gets attack cue?
    for (const c of acts) {
      const s = team.roster.find((x) => x.id === c.focusIds?.[0]);
      if (s?.archetype === "ShieldMaiden" && c.grade === "F") {
        // always gets action cue even on noop — presentation gap?
        add("MAIDEN_F_ACTION_CUE");
      }
    }

    if (team.boss && team.boss.currentHp < 0) add("BOSS_NEG_HP");

    if (team.phase === "boss_telegraph") {
      const stunned = (team.boss.stunRoundsLeft ?? 0) > 0;
      const tel = team.playback.find((c) => c.kind === "telegraph");
      if (stunned && tel && !tel.fx?.includes("stunned")) add("STUN_TEL_FX");
      if (stunned && tel?.sfxId) add("STUN_TEL_SFX");
      if (stunned && tel?.bubble?.text && !/stun/i.test(tel.bubble.text))
        add("STUN_TEL_TEXT", tel.bubble.text);
      resolveBoss(team);
      if (stunned) {
        const kinds = team.playback.map((c) => c.kind);
        if (kinds.includes("minion")) add("MINIONS_AFTER_BOSS_STUN");
        const stunCue = team.playback.find((c) =>
          (c.fx ?? []).some((f) => f.includes("stun")),
        );
        if (stunCue && (stunCue.fx ?? []).includes("boss-attack"))
          add("STUN_WITH_BOSS_ATTACK");
      }
      if (
        (team.minions ?? []).some((m) => m.currentHp <= 0) &&
        team.phase === "awaiting_magnet"
      )
        add("CORPSE_MINIONS");
    }
    rounds++;
  }
  return {
    seed,
    boss,
    rounds,
    phase: team.phase,
    bossHp: team.boss ? `${team.boss.currentHp}/${startHp}` : null,
    livingParty: living(team).length,
    livingRoster: livingRoster(team).length,
    dmgToBoss: startHp - (team.boss?.currentHp ?? 0),
    issueCounts,
    issueSamples,
  };
}

const archesBalanced = [
  "Vanguard",
  "ShieldMaiden",
  "FireMage",
  "Archer",
  "Thundercaller",
  "Healer",
];
const archesPower = [
  "FireMage",
  "FireMage",
  "Thundercaller",
  "Archer",
  "ShieldMaiden",
  "Runesinger",
];

function aggIssues(list) {
  return list.reduce((m, r) => {
    for (const [k, v] of Object.entries(r.issueCounts)) m[k] = (m[k] || 0) + v;
    return m;
  }, {});
}

console.log("=== Seed sweep smart balanced on Ash (typical) ===");
const results = [];
for (let seed = 1; seed <= 15; seed++) {
  results.push(runFight(seed, "ash_wraith", TYPICAL, archesBalanced, 50));
}
const wins = results.filter((r) => r.phase === "victory");
const losses = results.filter((r) => r.phase === "defeat");
console.log(
  `Wins ${wins.length}/15 Losses ${losses.length}/15 timeout ${results.length - wins.length - losses.length}`,
);
console.log(
  "Win rounds:",
  wins.map((r) => r.rounds),
  "avg",
  wins.length
    ? (wins.reduce((a, r) => a + r.rounds, 0) / wins.length).toFixed(1)
    : "n/a",
);
console.log(
  "Loss boss HP left:",
  losses.map((r) => r.bossHp),
);
console.log("Issues:", aggIssues(results));
console.log(
  "Samples:",
  JSON.stringify(
    results.flatMap((r) => r.issueSamples).slice(0, 25),
    null,
    2,
  ),
);

console.log("\n=== Power party Ash typical ===");
const power = [];
for (let seed = 1; seed <= 12; seed++)
  power.push(runFight(seed + 100, "ash_wraith", TYPICAL, archesPower, 50));
console.log(
  `Wins ${power.filter((r) => r.phase === "victory").length}/12 Losses ${power.filter((r) => r.phase === "defeat").length}/12`,
);
console.log("Issues:", aggIssues(power));

console.log("\n=== Power party Colossus generous ===");
const colo = [];
for (let seed = 1; seed <= 10; seed++)
  colo.push(runFight(seed + 200, "bone_colossus", GENEROUS, archesPower, 60));
console.log(
  `Wins ${colo.filter((r) => r.phase === "victory").length}/10 Losses ${colo.filter((r) => r.phase === "defeat").length}/10 timeout ${colo.filter((r) => r.phase === "awaiting_magnet").length}`,
);
console.log("Issues:", aggIssues(colo));

console.log("\n=== Soft-lock: victory with <6 living ===");
{
  const team = createTeam("soft2", "SFT2", "S", 42);
  const ids = partyIds(team, archesPower);
  selectParty(team, ids);
  startFight(team, "ash_wraith", GENEROUS);
  let n = 0;
  for (const s of living(team)) {
    if (n++ < 3) {
      s.currentHp = 0;
      s.alive = false;
    }
  }
  let keep = 5;
  for (const s of team.roster) {
    if (s.alive) {
      if (keep > 0) keep--;
      else {
        s.currentHp = 0;
        s.alive = false;
      }
    }
  }
  team.boss.currentHp = 0;
  team.phase = "victory";
  enterBetweenRooms(team, 3);
  console.log("phase", team.phase, "living", livingRoster(team).length);
  try {
    selectParty(team, partyIds(team, archesPower));
    console.log("reform ok — unexpected");
  } catch (e) {
    console.log("SOFT-LOCK:", e.message);
  }
}

console.log("\n=== All-F presentation ===");
{
  const team = createTeam("pres", "PRES", "P", 7);
  selectParty(team, partyIds(team, archesBalanced));
  startFight(team, "ash_wraith", Array(30).fill("F"));
  placeMagnet(
    team,
    living(team).find((s) => s.archetype === "Healer")?.position ?? 1,
  );
  commitRound(team);
  for (const a of team.playback.filter((c) => c.kind === "action")) {
    const s = team.roster.find((x) => x.id === a.focusIds?.[0]);
    console.log(
      `F ${s?.archetype} grade=${a.grade} fx=${JSON.stringify(a.fx)} bubble="${a.bubble?.text}" focus=${a.focusIds} sfx=${a.sfxId}`,
    );
  }
  console.log(
    "bossHp",
    team.boss.currentHp,
    "party",
    living(team).map((s) => `${s.archetype}:${s.currentHp}`),
  );
}

console.log("\n=== Stun skip + minions ===");
{
  let found = false;
  for (let seed = 300; seed < 450 && !found; seed++) {
    const team = createTeam(`st${seed}`, "ST", "S", seed);
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
    startFight(team, "bone_colossus", Array(25).fill("A"));
    for (let r = 0; r < 12 && team.phase === "awaiting_magnet"; r++) {
      const th = living(team).find((s) => s.archetype === "Thundercaller");
      placeMagnet(team, th?.position ?? 1);
      commitRound(team);
      if (
        (team.boss?.stunRoundsLeft ?? 0) > 0 &&
        team.phase === "boss_telegraph"
      ) {
        const tel = team.playback.find((c) => c.kind === "telegraph");
        resolveBoss(team);
        console.log(
          JSON.stringify(
            {
              seed,
              round: r + 1,
              tel: {
                text: tel?.bubble?.text,
                fx: tel?.fx,
                sfx: tel?.sfxId,
              },
              kinds: team.playback.map((c) => c.kind),
              stunCues: team.playback
                .filter((c) => (c.fx ?? []).some((f) => f.includes("stun")))
                .map((c) => ({
                  kind: c.kind,
                  fx: c.fx,
                  sfx: c.sfxId,
                  bubble: c.bubble?.text,
                })),
              minionAttacks: team.playback.filter((c) => c.kind === "minion")
                .length,
            },
            null,
            2,
          ),
        );
        found = true;
        break;
      }
      if (team.phase === "boss_telegraph") resolveBoss(team);
    }
  }
  if (!found) console.log("No stun in range");
}

console.log("\n=== Victory system cue (sfx in playback) ===");
{
  const team = createTeam("vic", "VIC", "V", 3);
  selectParty(team, partyIds(team, archesPower));
  startFight(team, "ash_wraith", GENEROUS);
  team.boss.currentHp = 8;
  placeMagnet(
    team,
    living(team).find((s) => s.archetype === "FireMage")?.position ?? 1,
  );
  commitRound(team);
  console.log("phase", team.phase);
  console.log(
    "victory/defeat cues:",
    team.playback
      .filter((c) => c.sfxId === "victory" || c.sfxId === "defeat")
      .map((c) => ({ kind: c.kind, sfx: c.sfxId, dur: c.durationMs })),
  );
}

console.log("\n=== DPS first 5 rounds power party Ash ===");
{
  const team = createTeam("dps", "DPS", "D", 55);
  selectParty(team, partyIds(team, archesPower));
  startFight(team, "ash_wraith", TYPICAL);
  let prev = team.boss.currentHp;
  for (let r = 0; r < 5 && team.phase === "awaiting_magnet"; r++) {
    placeMagnet(team, smartPos(team));
    commitRound(team);
    const dmg = prev - team.boss.currentHp;
    const claims = team.lastClaims.map((c) => {
      const s = team.roster.find((x) => x.id === c.soldierId);
      return `${s.archetype}:${c.effectiveGrade}`;
    });
    if (team.phase === "boss_telegraph") resolveBoss(team);
    const afterBoss = team.boss?.currentHp ?? 0;
    console.log(
      `R${r + 1} claims=${claims.join(",")} partyDmg=${dmg} boss=${afterBoss} living=${living(team)
        .map((s) => s.currentHp)
        .join("/")}`,
    );
    prev = afterBoss;
  }
}

// Campaign full: power + generous
console.log("\n=== Full campaign sim power+generous x5 ===");
for (let seed = 1; seed <= 5; seed++) {
  const team = createTeam(`camp${seed}`, "CAMP", "C", seed + 900);
  const roomBosses = ["ash_wraith", "bone_colossus", "bone_colossus"];
  let outcome = "unknown";
  const rooms = [];
  for (let room = 0; room < 3; room++) {
    try {
      selectParty(team, partyIds(team, archesPower));
    } catch (e) {
      outcome = `softlock_room${room + 1}: ${e.message}`;
      break;
    }
    startFight(team, roomBosses[room], GENEROUS);
    let r = 0;
    while (r < 70 && team.phase === "awaiting_magnet") {
      placeMagnet(team, smartPos(team));
      commitRound(team);
      if (team.phase === "boss_telegraph") resolveBoss(team);
      r++;
    }
    rooms.push({
      room: room + 1,
      phase: team.phase,
      rounds: r,
      living: livingRoster(team).length,
      boss: team.boss
        ? `${team.boss.currentHp}/${team.boss.maxHp}`
        : null,
    });
    if (team.phase === "victory") {
      enterBetweenRooms(team, 3);
      if (team.phase === "campaign_complete") {
        outcome = "campaign_complete";
        break;
      }
    } else {
      outcome = team.phase;
      break;
    }
  }
  console.log({ seed, outcome, rooms });
}
