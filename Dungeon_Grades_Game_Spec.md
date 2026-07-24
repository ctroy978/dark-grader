# Dungeon Grades — Complete Game Mechanics Specification

**Version**: 1.0  
**Date**: July 2026  
**Audience**: Coding AI / Developer  
**Purpose**: Authoritative, unambiguous spec for building a browser-based multiplayer classroom game (groups of 3 students on Chromebooks).

---

## 1. Overview & High-Level Goals

- **Core Fantasy**: After a test, students use their class grades (A–F) as power tokens to guide a party of 20 fantasy soldiers through a dungeon room. One room = one test. The campaign spans multiple tests/weeks.
- **Student Control**: Groups of 3 students manage one shared party of 6 soldiers. Their only direct control each round is **sliding the Token Magnet**.
- **Risk/Reward**: Token quality (A = excellent, F = dangerous) directly modifies what a soldier can do that round. Bad grades create chaos and attrition.
- **Persistence**: Soldiers carry HP between rooms. Limited healing creates long-term stakes. Goal: Reach the final boss with at least 6 viable soldiers.
- **Tone**: Darkest Dungeon-inspired tension with classroom-friendly visuals and pacing.

---

## 2. Roster & Specialists (≈20–24 soldiers)

Each soldier belongs to one archetype. Multiples exist for most types.

### 2.1 Archetype Token Effects (Claim = Action)

A soldier only performs a meaningful action if they **claim at least one token** that round. No token = they hold position (no attack, no special effect).

| Archetype          | Count | A                                      | B                                      | C                                      | D                                      | F                                      |
|--------------------|-------|----------------------------------------|----------------------------------------|----------------------------------------|----------------------------------------|----------------------------------------|
| **Vanguard**       | 2     | Solid block + good attack              | Good block + good attack               | Block + attack                         | Poor block, no attack                  | No block, no attack                    |
| **Shield Maiden**  | 3     | Solid attack                           | Good attack                            | Reroll shield                          | Bad attack                             | No attack + shield short-circuits (lose 1 HP if active) |
| **Fire Mage**      | 3     | Wildfire + boss Fire; front: burn Frozen + Ice/Slime | Wildfire + boss Fire; back: burn Frozen + Ice/Slime | Wildfire + friendly fire front | Ember + worse friendly fire | Explosion: party damage, no attack |
| **Healer**         | 3     | Heal all + clear Fire/Ice/Poison       | Heal front + clear Fire/Ice/Poison     | Heal back + clear Fire/Ice/Poison      | Heal self only                         | Backlash: heals boss                   |
| **Archer**         | 8     | Powerful volley                        | Good volley                            | Normal volley                          | Weak volley                            | Misfire: low dmg + 1–2 dmg to random ally |
| **Doomcaller**     | 2     | Strip DoTs+Marks; transfer all DoT stacks → boss | Strip; transfer one of each DoT → boss | Strip front DoTs/Marks (no transfer) | Strip back DoTs/Marks (no transfer) | Copy boss DoT types onto self |
| **Necromancer**    | 2–3   | Strong drain (boss dmg + heal ally)    | Good drain (dmg + small heal)          | Mild drain                             | Weak drain + self dmg                  | Backlash (boss heals or self dmg)      |
| **Thundercaller**  | 2–3   | Massive chain lightning + stun chance  | Good chain + minor chain               | Normal lightning strike                | Unstable strike + random party dmg     | Overload: party dmg, no boss dmg       |
| **Runesinger**     | 2–3   | Powerful rune (big buff or debuff)     | Good rune (solid buff/debuff)          | Basic rune (small team buff)           | Weak rune (self buff only)             | Corrupted rune (boss buff or party penalty) |

**Notes**:
- Shield Maidens start every fight with a **party-wide 1d6 shield**.
- Once the shield is depleted, Shield Maidens become normal fighters.
- **Cleanse split (current):** Healer → Fire/Ice/Poison; Fire Mage → Frozen (only) + Ice/Slime on A/B half-line; Doomcaller → all DoTs + Marks (transfer **DoTs only**). Frozen is never cleared by Healer or Doomcaller.

---

## 3. Combat Loop (One Round)

1. **Token Drop Phase**
   - Exactly **3 tokens** are drawn from the current fight’s pool (or reshuffled if exhausted).
   - The **Token Magnet** is visible on the 6-character line.

2. **Student Interaction (Token Magnet)**
   - One student per group slides the magnet to any position.
   - For each of the 3 tokens independently:
     - Character directly under magnet: **30%** chance to claim
     - Adjacent characters (wrap-around): **20%** each
     - All other characters: **10%** each
   - A character can claim **at most one token** per round. Excess claims are rerolled or ignored.

3. **Party Action Phase**
   - Characters act in queue order (front to back) **only if they claimed a token**.
   - Apply archetype effect based on the token’s grade.
   - Apply any DoT ticks (shields first).
   - Resolve deaths → trigger Doomcaller if applicable.

4. **Boss Action Phase**
   - Boss performs one attack from its current pool (random or scripted).
   - Resolve damage, status, adds, etc.

5. **End of Round**
   - Update persistent HP.
   - Check win/lose conditions.
   - Repeat until boss HP ≤ 0 or party wiped.

---

## 4. Token Magnet (Student Control)

- The line of 6 soldiers is **circular** for adjacency (position 1 and 6 are adjacent).
- Magnet placement is the **only direct student input** each round.
- Goal: Position the magnet to give high-value soldiers (Fire Mages vs DoTs, Healers when low HP, etc.) the best chance of claiming good tokens.

---

## 5. Status Effects & DoT System

All DoTs **hit Shield Maiden party-wide shield first**, then characters.

### 5.1 The Four DoT Types

| DoT Type   | Damage Speed | Duration     | Special Effect                                      | Who clears (soft)          |
|------------|--------------|--------------|-----------------------------------------------------|----------------------------|
| **Fire**   | Fast         | Medium       | High damage per tick; boss-sourced ramps            | **Healer** (also Doomcaller strip/transfer) |
| **Ice**    | Slow         | Short        | Reduces token quality by 1 step (A→B, D→F, F unchanged) | **Healer** + **Fire Mage** A/B half-line |
| **Poison** | Medium       | Long         | Party splash (magnet-weighted); boss-sourced ramps  | **Healer** (also Doomcaller) |
| **Slime**  | Very Slow    | Very Long    | Fewer tokens next drop                              | **Fire Mage** A/B half-line (also Doomcaller) |

### 5.2 Other Status
- **Mark**: Stripped by **Doomcaller** (not transferred to boss). Not cleared by Healer.
- **Frozen** (SpreadingFrost): Cannot attack or be healed; spreads then shatters. **Fire Mage only** burns it off (A front / B back). Not a DoT; not an Ice DoT.
- **Stun / Weaken / etc.**: As defined in boss attack library.

---

## 6. Boss System (Modular / Plug & Play)

A boss is defined by:
- **Base Stats**: Max HP, damage multiplier, optional traits (e.g., "Undead", "Volatile").
- **Attack Pool**: 3–5 attacks chosen from the library below.
- **One attack per round** (random or in a short sequence).

### 6.1 Modular Attack Library

**Damage & Positioning**
- Front Slam (heavy to pos 1–2/3)
- Rear Sweep (pos 5–6)
- Line Attack (moderate to all)
- Targeted Strike (high to 1–2 random or magnet-biased)
- Cascade (damage decreases across line)

**Status & DoTs**
- Apply **Fire / Ice / Poison / Slime** DoT
- Stun Blast
- Weaken
- Mark
- Token Interference (disrupts next magnet)

**Sustain & Utility**
- Regenerate
- Leech (can be partially blocked by Necromancer)
- Enrage
- Reflection Shield
- Position Swap
- Summon Adds (thematic minions)

**Adds Rules**
- Thematically tied to boss (Fire Imps, Bone Skeletons, etc.).
- Each Add attacks **one party member**, biased toward the current Token Magnet position.
- While Adds exist, **all party attacks automatically target Adds first** until cleared.

---

## 7. Campaign & Persistence Rules

- **HP carries over** between rooms.
- **Inter-room healing**: Only Vanguards provide meaningful recovery (e.g., 20–30% party heal or targeted front-line healing).
- **Death consequences**: Dead soldiers are removed from the roster for future rooms (or heavily debuffed).
- **Token Pool**: One test = one pool of tokens. Pool is used across the entire fight. When exhausted, tokens reshuffle in random order.
- **Win Condition**: Reduce boss HP to 0.
- **Campaign Goal**: Reach final boss with ≥6 soldiers still functional.

---

## 8. Data Structures (Recommended for Implementation)

```json
{
  "soldier": {
    "id": "vanguard_01",
    "archetype": "Vanguard",
    "current_hp": 45,
    "max_hp": 50,
    "position": 1,
    "status": []
  },
  "token": "A" | "B" | "C" | "D" | "F",
  "magnet_position": 1-6,
  "dot": {
    "type": "Fire" | "Ice" | "Poison" | "Slime",
    "stacks": 1,
    "duration": 3
  },
  "boss": {
    "name": "Bone Colossus",
    "max_hp": 300,
    "current_hp": 300,
    "attacks": ["FrontSlam", "Regenerate", "SummonAdds"],
    "current_attack_index": 0
  }
}
```

---

## 9. Non-Functional Requirements

- **Performance**: Runs smoothly in Chrome on school Chromebooks (groups of 3).
- **Accessibility**: Clear visuals, large text, simple animations (falling tokens, damage numbers, HP bars).
- **Teacher Tools**: Easy way to input test grades → generate token pool, spawn bosses, reset campaign.
- **Multiplayer**: Lightweight sync between the 3 students in a group (shared state for magnet, HP, tokens).
- **Visual Style**: Simple 2D side-view (Darkest Dungeon inspiration) — character line on left, boss on right. Use emoji, CSS, or lightweight canvas.

---

## 10. Future Expansion Hooks

- New specialists
- More DoT types or status effects
- Boss traits that interact with archetypes (e.g., “Undead” gives Necromancer bonus)
- Story/lore unlocks after clearing rooms
- Difficulty scaling based on class performance

---

**End of Specification**

This document is intended to be sufficient for a coding AI to implement the core loop, token/magnet system, specialist behaviors, DoT interactions, and modular boss system. Additional details (exact damage numbers, UI mockups, animation timing) can be iterated in follow-up conversations.