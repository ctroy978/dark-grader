/**
 * Automated classroom playtest against a running server.
 * Usage: node scripts/playtest.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3001";
const PIN = "teacher";

const CLIENT_FX = new Set([
  "poison-tint",
  "fire-flash",
  "heal-glow",
  "hurt-flash",
  "attack-flash",
  "claim-pop",
  "boss-attack",
  "boss-windup",
  // substring matches in poses.ts: poison, fire, heal, stun (pose only)
]);

async function req(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  let body = init.body;
  if (init.method && init.method !== "GET" && init.method !== "HEAD") {
    if (body === undefined) body = "{}";
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? res.statusText ?? `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function j(obj) {
  return JSON.stringify(obj);
}

const findings = [];
function note(severity, run, msg, detail = null) {
  findings.push({ severity, run, msg, detail });
}

function partyLine(team) {
  return team.activePartyIds
    .map((id) => {
      const s = team.roster.find((x) => x.id === id);
      if (!s) return "?";
      return `P${s.position}:${s.name.slice(0, 8)}(${s.archetype.slice(0, 4)})${s.alive ? s.currentHp : "DEAD"}`;
    })
    .join(" | ");
}

function livingParty(team) {
  return team.roster.filter(
    (s) => s.alive && team.activePartyIds.includes(s.id),
  );
}

function byArchetype(team, arch) {
  return livingParty(team).filter((s) => s.archetype === arch);
}

/** Smart magnet: prefer useful living specialists for current situation. */
function smartMagnet(team) {
  const living = livingParty(team).sort((a, b) => a.position - b.position);
  if (!living.length) return 1;

  const pending = team.pendingTokens ?? [];
  const hasA = pending.includes("A");
  const hasF = pending.includes("F");
  const partyHp = living.reduce((a, s) => a + s.currentHp, 0);
  const maxHp = living.reduce((a, s) => a + s.maxHp, 0);
  const hurt = partyHp / maxHp < 0.55;
  const dots = living.some((s) => s.statuses?.some((st) => st.kind === "Dot"));
  const minions = (team.minions ?? []).filter((m) => m.currentHp > 0);
  const shieldLow =
    !team.partyShield?.active || (team.partyShield?.remaining ?? 0) <= 1;

  const pick = (archs) => {
    for (const a of archs) {
      const s = living.find((x) => x.archetype === a);
      if (s) return s.position;
    }
    return null;
  };

  // Avoid parking F on FireMage/Healer/Necro if we can put it on tank
  if (hasF && !hasA) {
    const tank = pick(["Vanguard", "Spearman", "ShieldMaiden", "Thundercaller"]);
    if (tank) return tank;
  }
  const dead = (team.roster ?? []).some(
    (s) => team.activePartyIds?.includes(s.id) && !s.alive,
  );
  if (dead && hasA) {
    const t = pick(["Thundercaller"]);
    if (t) return t;
  }
  if (minions.length) {
    // Only front + Archer can clear the gap
    const a = pick(["Archer", "Spearman", "Vanguard"]);
    if (a) return a;
  }
  if (dots) {
    const d = pick(["FireMage", "Healer"]);
    if (d) return d;
  }
  if (hurt) {
    const h = pick(["Healer", "Runesinger", "Necromancer"]);
    if (h) return h;
  }
  if (shieldLow) {
    const m = pick(["ShieldMaiden", "Vanguard", "Spearman"]);
    if (m) return m;
  }
  if (hasA) {
    const dps = pick([
      "FireMage",
      "Thundercaller",
      "Archer",
      "Spearman",
      "ShieldMaiden",
      "Runesinger",
    ]);
    if (dps) return dps;
  }
  return living[Math.floor(living.length / 2)].position;
}

function afkMagnet(team) {
  const living = livingParty(team);
  return living[0]?.position ?? 1;
}

function analyzePlayback(team, run, phase) {
  const pb = team.playback ?? [];
  const allFx = new Set();
  for (const cue of pb) {
    for (const f of cue.fx ?? []) allFx.add(f);

    // Bubble length (UI)
    if (cue.bubble?.text && cue.bubble.text.length > 48) {
      note(
        "warn",
        run,
        `Long bubble (${cue.bubble.text.length} chars) in ${phase}`,
        cue.bubble.text,
      );
    }

    // Reveal consistency on action cues
    if (
      ["action", "boss", "minion", "hurt", "dot", "death"].includes(cue.kind) &&
      !cue.reveal
    ) {
      note(
        "warn",
        run,
        `Cue kind=${cue.kind} missing board reveal`,
        cue.id,
      );
    }

    // Stun telegraph should not play attack sfx
    if (
      cue.kind === "telegraph" &&
      (cue.fx ?? []).includes("stunned") &&
      cue.sfxId
    ) {
      note(
        "bug",
        run,
        "Stunned telegraph still has sfxId (should be silent wind-up)",
        cue,
      );
    }

    // Stun skip should not look like boss attack
    if (
      (cue.fx ?? []).some((f) => f.includes("stun")) &&
      (cue.fx ?? []).includes("boss-attack")
    ) {
      note("bug", run, "Stun cue also has boss-attack FX", cue);
    }
  }

  // Client unmapped FX
  for (const f of allFx) {
    const mapped =
      CLIENT_FX.has(f) ||
      f.includes("poison") ||
      f.includes("fire") ||
      f.includes("heal") ||
      f.includes("stun") ||
      f === "boss-windup" ||
      f === "boss-attack" ||
      f === "attack-flash" ||
      f === "claim-pop" ||
      f === "hurt-flash";
    // grade-*, token-drop, backfire, minion-shot, death, curse-burst, enraged, minion-kill, dot-tick are often unmapped
    if (!mapped) {
      note("info", run, `Unmapped client FX tag: ${f}`, phase);
    }
  }

  // Claim count vs lastClaims
  const claims = pb.filter((c) => c.kind === "claim");
  if (team.lastClaims && claims.length !== team.lastClaims.length && phase === "after_party") {
    note(
      "bug",
      run,
      `Claim cues (${claims.length}) != lastClaims (${team.lastClaims.length})`,
    );
  }

  // Runesinger should act before other party actions in playback order
  const actions = pb.filter((c) => c.kind === "action");
  if (actions.length > 1) {
    const ids = actions.map((c) => c.focusIds?.[0]);
    const archOf = (id) => team.roster.find((s) => s.id === id)?.archetype;
    const firstRs = ids.findIndex((id) => archOf(id) === "Runesinger");
    if (firstRs > 0) {
      // Runesinger claimer exists but not first action
      note(
        "bug",
        run,
        "Runesinger action is not first among action cues",
        ids.map(archOf),
      );
    }
  }

  // Magnet always claims (if there were tokens)
  if (phase === "after_party" && (team.lastClaims?.length ?? 0) > 0) {
    const magSoldier = team.roster.find(
      (s) =>
        s.position === team.magnetPosition &&
        team.activePartyIds.includes(s.id),
    );
    if (magSoldier?.alive) {
      const magClaimed = team.lastClaims.some(
        (c) => c.soldierId === magSoldier.id,
      );
      if (!magClaimed) {
        note(
          "bug",
          run,
          `Magnet soldier ${magSoldier.name} @${team.magnetPosition} did not claim (guarantee broken)`,
          team.lastClaims,
        );
      }
    }
  }

  // Double claims
  if (team.lastClaims) {
    const seen = new Set();
    for (const c of team.lastClaims) {
      if (seen.has(c.soldierId)) {
        note("bug", run, `Soldier claimed twice: ${c.soldierId}`);
      }
      seen.add(c.soldierId);
    }
  }

  return allFx;
}

async function setupClassroom(grades) {
  await req("/api/teacher/grades", {
    method: "POST",
    body: j({ pin: PIN, grades }),
  });
  await req("/api/teacher/campaign", {
    method: "POST",
    body: j({
      pin: PIN,
      campaignLength: 3,
      roomBossIds: ["ash_wraith", "bone_colossus", "bone_colossus"],
    }),
  });
}

async function newTeam(name) {
  return req("/api/teacher/teams", {
    method: "POST",
    body: j({ pin: PIN, name }),
  });
}

function pickBalancedParty(roster) {
  // Prefer one of each key role when possible
  const want = [
    "Vanguard",
    "ShieldMaiden",
    "FireMage",
    "Healer",
    "Archer",
    "Runesinger",
  ];
  const alt = ["Thundercaller", "Spearman", "Necromancer", "Archer", "FireMage"];
  const picked = [];
  const used = new Set();
  for (const a of want) {
    const s = roster.find((x) => x.archetype === a && !used.has(x.id));
    if (s) {
      picked.push(s.id);
      used.add(s.id);
    }
  }
  for (const a of alt) {
    if (picked.length >= 6) break;
    const s = roster.find((x) => x.archetype === a && !used.has(x.id));
    if (s) {
      picked.push(s.id);
      used.add(s.id);
    }
  }
  while (picked.length < 6) {
    const s = roster.find((x) => !used.has(x.id));
    if (!s) break;
    picked.push(s.id);
    used.add(s.id);
  }
  return picked.slice(0, 6);
}

function pickGlassCannon(roster) {
  // Max damage, weak sustain
  const order = [
    "FireMage",
    "FireMage",
    "Archer",
    "Archer",
    "Thundercaller",
    "Necromancer",
  ];
  return pickByOrder(roster, order);
}

function pickTankHeal(roster) {
  const order = [
    "Vanguard",
    "ShieldMaiden",
    "ShieldMaiden",
    "Healer",
    "Healer",
    "Runesinger",
  ];
  return pickByOrder(roster, order);
}

function pickByOrder(roster, order) {
  const used = new Set();
  const picked = [];
  for (const a of order) {
    const s = roster.find((x) => x.archetype === a && !used.has(x.id));
    if (s) {
      picked.push(s.id);
      used.add(s.id);
    }
  }
  while (picked.length < 6) {
    const s = roster.find((x) => !used.has(x.id));
    if (!s) break;
    picked.push(s.id);
    used.add(s.id);
  }
  return picked.slice(0, 6);
}

async function formAndStart(team, pickFn) {
  let t = await req(`/api/team/${team.teamId}`);
  // Lobby after create — may need reset
  if (!["lobby", "between_rooms"].includes(t.phase) && t.phase !== "awaiting_magnet") {
    t = await req(`/api/teacher/teams/${team.teamId}/reset`, {
      method: "POST",
      body: j({ pin: PIN }),
    });
  }
  const ids = pickFn(t.roster);
  t = await req(`/api/team/${team.teamId}/roster`, {
    method: "POST",
    body: j({ soldierIds: ids }),
  });
  t = await req(`/api/team/${team.teamId}/start-fight`, { method: "POST" });
  return t;
}

async function playCampaign(runName, pickFn, magnetFn, maxRounds = 80) {
  const summary = {
    run: runName,
    rooms: [],
    outcome: null,
    roundsTotal: 0,
    errors: [],
    fxSeen: new Set(),
    archetypesUsed: new Set(),
    events: {
      stuns: 0,
      deaths: 0,
      victories: 0,
      defeats: 0,
      returns: 0,
      continues: 0,
      runesingerFirstOk: 0,
      magnetMiss: 0,
    },
  };

  try {
    const team0 = await newTeam(runName);
    let team = await formAndStart(team0, pickFn);
    for (const s of team.roster) {
      if (team.activePartyIds.includes(s.id)) summary.archetypesUsed.add(s.archetype);
    }

    let safety = 0;
    while (safety++ < maxRounds) {
      if (team.phase === "campaign_complete") {
        summary.outcome = "campaign_complete";
        break;
      }
      if (team.phase === "victory") {
        summary.events.victories++;
        summary.rooms.push({
          room: team.currentRoom,
          boss: team.boss?.name,
          round: team.round,
          alive: livingParty(team).length,
          result: "victory",
        });
        team = await req(`/api/team/${team.teamId}/continue`, { method: "POST" });
        summary.events.continues++;
        // reform if needed and start next fight
        if (team.phase === "between_rooms" || team.phase === "lobby") {
          const living = team.roster.filter((s) => s.alive);
          if (living.length < 6) {
            // need 6 alive? selectParty might allow fewer living + dead slots? check
            note("info", runName, `Only ${living.length} living after room — reforming`);
          }
          const ids = pickFn(team.roster.filter((s) => s.alive).length >= 6
            ? team.roster
            : team.roster /* may fail if need 6 living */);
          // Prefer living only
          const livingIds = team.roster.filter((s) => s.alive).map((s) => s.id);
          let soldierIds = pickFn(team.roster).filter((id) =>
            livingIds.includes(id),
          );
          // fill with any living
          for (const id of livingIds) {
            if (soldierIds.length >= 6) break;
            if (!soldierIds.includes(id)) soldierIds.push(id);
          }
          soldierIds = soldierIds.slice(0, 6);
          if (soldierIds.length < 6) {
            note(
              "bug",
              runName,
              `Cannot field 6 living soldiers (${soldierIds.length}) for next room`,
            );
            summary.outcome = "stuck_low_roster";
            break;
          }
          try {
            team = await req(`/api/team/${team.teamId}/roster`, {
              method: "POST",
              body: j({ soldierIds }),
            });
            team = await req(`/api/team/${team.teamId}/start-fight`, {
              method: "POST",
            });
          } catch (e) {
            note("bug", runName, `Failed to start next room: ${e.message}`);
            summary.outcome = "stuck_start";
            summary.errors.push(e.message);
            break;
          }
        }
        continue;
      }

      if (team.phase === "defeat") {
        summary.events.defeats++;
        summary.rooms.push({
          room: team.currentRoom,
          boss: team.boss?.name,
          round: team.round,
          alive: 0,
          result: "defeat",
        });
        // Retry once via return-from-defeat if anyone left in campaign roster
        const livingRoster = team.roster.filter((s) => s.alive).length;
        if (livingRoster >= 6 && summary.events.returns < 2) {
          team = await req(`/api/team/${team.teamId}/return-from-defeat`, {
            method: "POST",
          });
          summary.events.returns++;
          const livingIds = team.roster.filter((s) => s.alive).map((s) => s.id);
          let soldierIds = pickFn(team.roster).filter((id) =>
            livingIds.includes(id),
          );
          for (const id of livingIds) {
            if (soldierIds.length >= 6) break;
            if (!soldierIds.includes(id)) soldierIds.push(id);
          }
          soldierIds = soldierIds.slice(0, 6);
          try {
            team = await req(`/api/team/${team.teamId}/roster`, {
              method: "POST",
              body: j({ soldierIds }),
            });
            team = await req(`/api/team/${team.teamId}/start-fight`, {
              method: "POST",
            });
          } catch (e) {
            note("bug", runName, `Retry after defeat failed: ${e.message}`);
            summary.outcome = "defeat_no_retry";
            break;
          }
          continue;
        }
        summary.outcome = "defeat";
        break;
      }

      if (team.phase === "awaiting_magnet") {
        // Pending tokens should be present for telegraph
        if (!team.pendingTokens?.length) {
          note(
            "warn",
            runName,
            `No pendingTokens at magnet phase round ${team.round}`,
          );
        }

        // Magnet on dead?
        const pos = magnetFn(team);
        const under = team.roster.find(
          (s) => s.position === pos && team.activePartyIds.includes(s.id),
        );
        if (under && !under.alive) {
          note("bug", runName, `Magnet strategy picked dead pos ${pos}`);
        }

        try {
          team = await req(`/api/team/${team.teamId}/magnet`, {
            method: "POST",
            body: j({ position: pos }),
          });
        } catch (e) {
          // try first living
          const fallback = livingParty(team)[0]?.position ?? 1;
          try {
            team = await req(`/api/team/${team.teamId}/magnet`, {
              method: "POST",
              body: j({ position: fallback }),
            });
            note("info", runName, `Magnet ${pos} failed (${e.message}), used ${fallback}`);
          } catch (e2) {
            note("bug", runName, `Magnet place failed: ${e2.message}`);
            summary.outcome = "stuck_magnet";
            break;
          }
        }

        // Drop tokens (party phase)
        team = await req(`/api/team/${team.teamId}/commit-round`, {
          method: "POST",
        });
        summary.roundsTotal++;

        const fx1 = analyzePlayback(team, runName, "after_party");
        for (const f of fx1) summary.fxSeen.add(f);

        // Check magnet guarantee
        const magSoldier = team.roster.find(
          (s) =>
            s.position === team.magnetPosition &&
            team.activePartyIds.includes(s.id),
        );
        if (
          magSoldier?.alive &&
          (team.lastClaims?.length ?? 0) > 0 &&
          !team.lastClaims.some((c) => c.soldierId === magSoldier.id)
        ) {
          summary.events.magnetMiss++;
        }

        // Check logs for stun
        const recent = (team.log ?? []).slice(-30);
        if (recent.some((l) => /stun/i.test(l.text))) summary.events.stuns++;
        if (recent.some((l) => /fallen/i.test(l.text))) summary.events.deaths++;

        // HP integrity
        for (const s of team.roster) {
          if (s.currentHp < 0) {
            note("bug", runName, `Negative HP: ${s.name} ${s.currentHp}`);
          }
          if (s.currentHp > s.maxHp) {
            note("bug", runName, `Overheal beyond max: ${s.name} ${s.currentHp}/${s.maxHp}`);
          }
          if (s.alive && s.currentHp <= 0) {
            note("bug", runName, `Alive with 0 HP: ${s.name}`);
          }
          if (!s.alive && s.currentHp > 0) {
            note("warn", runName, `Dead with HP>0: ${s.name} ${s.currentHp}`);
          }
        }
        if (team.boss) {
          if (team.boss.currentHp < 0) {
            note("bug", runName, `Boss negative HP ${team.boss.currentHp}`);
          }
          // minion purge rule: 0hp minions should still be present after party
          const zeroMin = (team.minions ?? []).filter((m) => m.currentHp <= 0);
          // OK after party, purged on resolveBoss
        }

        // Party shield consistency
        if (
          team.partyShield?.active &&
          (team.partyShield.remaining ?? 0) <= 0
        ) {
          note(
            "warn",
            runName,
            "Party shield active with remaining<=0 after party",
          );
        }

        if (team.phase === "boss_telegraph") {
          const stunned = (team.boss?.stunRoundsLeft ?? 0) > 0;
          const tel = (team.playback ?? []).find((c) => c.kind === "telegraph");
          if (stunned) {
            if (!tel) {
              note("bug", runName, "Boss stunned but no telegraph cue");
            } else if (!(tel.fx ?? []).some((f) => f.includes("stun"))) {
              note(
                "bug",
                runName,
                "Boss stunned but telegraph FX not stunned",
                tel,
              );
            } else if (tel.sfxId) {
              note("bug", runName, "Stunned telegraph has SFX", tel.sfxId);
            }
            if (tel?.bubble?.text && !/stun/i.test(tel.bubble.text)) {
              note(
                "bug",
                runName,
                "Stunned boss bubble not 'Stunned…'",
                tel.bubble.text,
              );
            }
          }

          team = await req(`/api/team/${team.teamId}/resolve-boss`, {
            method: "POST",
          });
          const fx2 = analyzePlayback(team, runName, "after_boss");
          for (const f of fx2) summary.fxSeen.add(f);

          // After boss, dead minions should be purged
          const corpse = (team.minions ?? []).filter((m) => m.currentHp <= 0);
          if (corpse.length && team.phase === "awaiting_magnet") {
            note(
              "bug",
              runName,
              `Dead minions still present after resolveBoss: ${corpse.map((m) => m.name).join(",")}`,
            );
          }
        }
        continue;
      }

      // Unexpected phase
      note("bug", runName, `Unexpected phase: ${team.phase}`, {
        round: team.round,
        line: partyLine(team),
      });
      summary.outcome = `stuck_${team.phase}`;
      break;
    }

    if (!summary.outcome) {
      summary.outcome = safety >= maxRounds ? "timeout" : team.phase;
    }
    summary.finalPhase = team.phase;
    summary.finalRound = team.round;
    summary.finalAlive = livingParty(team).length;
    summary.bossHp = team.boss
      ? `${team.boss.currentHp}/${team.boss.maxHp}`
      : null;
    summary.fxList = [...summary.fxSeen].sort();
  } catch (e) {
    summary.outcome = "error";
    summary.errors.push(e.message);
    note("bug", runName, `Unhandled: ${e.message}`, e.stack);
  }

  return summary;
}

// --- Edge-case probes (short) ---
async function edgeCases() {
  const run = "edge";
  await setupClassroom(
    "A A A B B B C C C C D D D F F F A B C D F A B C".split(" "),
  );
  const team0 = await newTeam("EdgeCases");
  let team = await formAndStart(team0, pickBalancedParty);

  // Double commit without resolve
  if (team.phase === "awaiting_magnet") {
    team = await req(`/api/team/${team.teamId}/magnet`, {
      method: "POST",
      body: j({ position: 1 }),
    });
    team = await req(`/api/team/${team.teamId}/commit-round`, { method: "POST" });
    if (team.phase === "boss_telegraph") {
      try {
        await req(`/api/team/${team.teamId}/commit-round`, { method: "POST" });
        note("bug", run, "Double commit-round succeeded in boss_telegraph");
      } catch {
        note("info", run, "Double commit correctly rejected");
      }
    }
  }

  // Magnet on dead — force kill via many rounds then try
  // Invalid magnet position
  try {
    await req(`/api/team/${team.teamId}/magnet`, {
      method: "POST",
      body: j({ position: 9 }),
    });
    note("bug", run, "Magnet position 9 accepted");
  } catch {
    note("info", run, "Invalid magnet position rejected");
  }

  // Continue without victory
  try {
    await req(`/api/team/${team.teamId}/continue`, { method: "POST" });
    // may or may not throw depending on implementation
    const t = await req(`/api/team/${team.teamId}`);
    if (t.phase !== "boss_telegraph" && t.phase !== "awaiting_magnet" && t.phase !== "victory") {
      note("info", run, `Continue from non-victory → phase ${t.phase}`);
    } else if (t.roomIndex > team.roomIndex && team.phase !== "victory") {
      note("bug", run, "Continue advanced room without victory");
    }
  } catch (e) {
    note("info", run, `Continue rejected: ${e.message}`);
  }

  // resolve-boss when not telegraph
  team = await req(`/api/team/${team.teamId}`);
  if (team.phase !== "boss_telegraph") {
    try {
      await req(`/api/team/${team.teamId}/resolve-boss`, { method: "POST" });
      note("bug", run, "resolve-boss accepted outside telegraph");
    } catch {
      note("info", run, "resolve-boss correctly rejected outside telegraph");
    }
  }

  // Empty grades already set; try empty roster
  try {
    await req(`/api/team/${team.teamId}/roster`, {
      method: "POST",
      body: j({ soldierIds: [] }),
    });
    note("warn", run, "Empty roster accepted");
  } catch {
    note("info", run, "Empty roster rejected");
  }

  // Party of 5
  try {
    const ids = team.roster.slice(0, 5).map((s) => s.id);
    await req(`/api/team/${team.teamId}/roster`, {
      method: "POST",
      body: j({ soldierIds: ids }),
    });
    note("warn", run, "Party of 5 accepted (expected 6?)");
  } catch {
    note("info", run, "Party of 5 rejected (requires 6)");
  }

  // Duplicate soldier ids
  try {
    const id = team.roster[0].id;
    await req(`/api/team/${team.teamId}/roster`, {
      method: "POST",
      body: j({ soldierIds: [id, id, id, id, id, id] }),
    });
    note("warn", run, "Duplicate soldier ids accepted as party of 6");
  } catch {
    note("info", run, "Duplicate soldier ids rejected");
  }
}

async function main() {
  console.log("Playtest against", BASE);
  const health = await req("/api/health");
  console.log("Health:", health);

  // Grade pools: typical class + harsh class
  const typical =
    "A A A A B B B B B C C C C C C D D D D F F F F".split(" ");
  const harsh = "A B B C C C C D D D D D F F F F F F F".split(" ");
  const generous = "A A A A A B B B B C C C D D F".split(" ");

  await setupClassroom(typical);

  const runs = [];
  runs.push(await playCampaign("smart-balanced", pickBalancedParty, smartMagnet));
  runs.push(await playCampaign("afk-balanced", pickBalancedParty, afkMagnet));
  runs.push(await playCampaign("smart-glass", pickGlassCannon, smartMagnet));
  runs.push(await playCampaign("smart-tankheal", pickTankHeal, smartMagnet));

  await setupClassroom(harsh);
  runs.push(await playCampaign("harsh-smart", pickBalancedParty, smartMagnet));

  await setupClassroom(generous);
  runs.push(await playCampaign("generous-smart", pickBalancedParty, smartMagnet));

  await edgeCases();

  // --- Report ---
  console.log("\n========== RUN SUMMARIES ==========\n");
  for (const r of runs) {
    console.log(
      JSON.stringify(
        {
          run: r.run,
          outcome: r.outcome,
          rounds: r.roundsTotal,
          rooms: r.rooms,
          events: r.events,
          final: {
            phase: r.finalPhase,
            round: r.finalRound,
            alive: r.finalAlive,
            bossHp: r.bossHp,
          },
          errors: r.errors,
          archetypes: [...r.archetypesUsed],
          fxCount: r.fxList?.length,
        },
        null,
        2,
      ),
    );
  }

  // Aggregate FX
  const allFx = new Set();
  for (const r of runs) for (const f of r.fxList ?? []) allFx.add(f);
  console.log("\n========== ALL FX TAGS SEEN ==========");
  console.log([...allFx].sort().join(", "));

  const mapped = [];
  const unmapped = [];
  for (const f of [...allFx].sort()) {
    const ok =
      CLIENT_FX.has(f) ||
      f.includes("poison") ||
      f.includes("fire") ||
      f.includes("heal") ||
      f.includes("stun") ||
      ["boss-windup", "boss-attack", "attack-flash", "claim-pop", "hurt-flash"].includes(
        f,
      );
    (ok ? mapped : unmapped).push(f);
  }
  console.log("Mapped-ish:", mapped.join(", ") || "(none)");
  console.log("Unmapped:", unmapped.join(", ") || "(none)");

  console.log("\n========== FINDINGS ==========\n");
  const bySev = { bug: [], warn: [], info: [] };
  for (const f of findings) {
    (bySev[f.severity] ?? bySev.info).push(f);
  }
  for (const sev of ["bug", "warn", "info"]) {
    const list = bySev[sev];
    // Dedupe messages
    const counts = new Map();
    for (const f of list) {
      const key = f.msg;
      const c = counts.get(key) ?? { n: 0, sample: f };
      c.n++;
      counts.set(key, c);
    }
    console.log(`--- ${sev.toUpperCase()} (${list.length} raw, ${counts.size} unique) ---`);
    for (const [msg, c] of [...counts.entries()].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`  [${c.n}x] ${msg}`);
      if (c.sample.detail && typeof c.sample.detail === "string" && c.sample.detail.length < 120) {
        console.log(`         e.g. ${c.sample.detail}`);
      }
    }
    console.log();
  }

  // Write full report
  const report = {
    at: new Date().toISOString(),
    runs: runs.map((r) => ({
      ...r,
      fxSeen: undefined,
      archetypesUsed: [...r.archetypesUsed],
      fxList: r.fxList,
    })),
    findings,
    fxAll: [...allFx].sort(),
    fxUnmapped: unmapped,
  };
  const fs = await import("node:fs");
  fs.writeFileSync(
    "scripts/playtest-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log("Wrote scripts/playtest-report.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
