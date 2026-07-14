# Dungeon Grades — UI & Layout Specification

**Version**: 1.0  
**Date**: July 2026  
**Focus**: Visual layout, user interface, and interaction design  
**Style Inspiration**: Darkest Dungeon (side-view combat, tense atmosphere, clear positioning)

---

## 1. Overall Visual Style & Theme

- **Art Direction**: Dark fantasy / grim academic aesthetic. Dark parchment backgrounds, glowing runes, subtle particle effects.
- **Color Palette**:
  - Dark navy / deep red / parchment beige
  - Grade colors: A = bright green/gold, B = yellow, C = neutral white, D = orange, F = deep red/crimson
- **Tone**: Tense but classroom-appropriate. Dramatic without being overly gory.
- **Animations**: Smooth but not flashy. Token falling, magnet sliding, damage numbers popping, shield cracking, DoT ticks pulsing.

---

## 2. Main Combat Screen Layout (Student View)

**Screen Ratio**: 16:9 (landscape) — optimized for Chromebooks.

### Layout Zones (Left to Right)

```
[ Party Line ]          [ Middle Gap / Minions ]          [ Boss ]
      ↑
   Token Magnet (glows & slides under characters)
```

**Detailed Breakdown**:

### 2.1 Left Side — Party (6 Characters)
- **Orientation**: Characters face **right** (toward the boss).
- **Arrangement**: Horizontal line, slight perspective (front characters slightly larger or lower).
- **Each Character Card**:
  - Portrait / simple sprite
  - Name + Archetype icon
  - Current HP bar (red fill)
  - Shield bar (blue, only visible while active on Shield Maidens)
  - Status icons (DoTs, Marks, Stun, etc.)
  - Current token indicator (if they claimed one this round)

**Token Magnet**:
- Stylized glowing magical object (rune circle + floating particles).
- Slides smoothly under the chosen character when student clicks 1–6.
- Glow intensity increases when positioned.
- Controlled by **clicking number keys 1–6** or on-screen buttons.

### 2.2 Center Gap — Minions / Adds
- Empty space between party and boss.
- When minions spawn, they appear here (smaller sprites, possibly in a loose formation).
- Minions face left (toward the party).
- Visual feedback when they attack (projectiles or arrows flying toward the magnet-targeted character).

### 2.3 Right Side — Boss
- Large, imposing sprite or illustration.
- Boss name + current HP bar (thick, prominent).
- Status effects visible below the boss.
- Attack name / description briefly flashes when boss acts.

### 2.4 Top Area — Grade Token Cloud
- **Visual**: 5–6 glowing grade tokens floating in a misty/cloud formation above the party.
- Tokens look like large, stylized letters (A–F) with magical rune overlays and subtle particle trails.
- Every round:
  1. Three random tokens from the cloud **fall** toward the party line.
  2. They are claimed according to magnet probabilities.
  3. The cloud **refills** with new random tokens (maintaining 5–6 visible).
- Animation: Tokens gently bob in the cloud, then dramatically fall when selected.

### 2.5 Bottom / HUD Area
- Round number
- Remaining tokens in current pool (or “Tokens Reshuffling” message)
- Team name / Invite code indicator
- Simple action log (scrollable, shows key events like “Pyra claimed an A!”, “Poison DoT applied”, “Skeleton Archer focuses Magnet position”)

---

## 3. Student Interaction Flow (Per Round)

1. **Magnet Phase** (Student-controlled)
   - Students click **1, 2, 3, 4, 5, or 6** to move the glowing magnet under the desired character.
   - Visual confirmation: Magnet smoothly slides and pulses.

2. **Token Drop** (Automatic / Animated)
   - Three tokens fall from the cloud.
   - Claim resolution happens with probability visuals (optional subtle glow on possible claimers).

3. **Resolution**
   - Characters who claimed tokens perform their actions (animations: attacks, heals, explosions, etc.).
   - Boss acts.
   - Damage numbers, healing numbers, and status icons appear.

---

## 4. Teacher Dashboard UI

### 4.1 Main Teacher Screen Sections

**A. Grade Input Panel**
- Simple form to enter or upload class grades for the current test.
- Options:
  - Manual entry (list of A/B/C/D/F)
  - Paste from spreadsheet / Google Classroom
  - Quick distribution sliders (“Mostly B/C”, “Tough test”, etc.)
- Button: **“Generate Token Pool”** → Creates the pool used for this fight.

**B. Boss Selection**
- Scrollable or grid list of all available bosses.
- Each boss card shows: Name, Difficulty, Recommended round count, Key mechanics summary.
- Teacher clicks **“Select Boss for Today”** → All active teams fight the same boss.
- Option to preview boss attacks.

**C. Team / Invite Code Management**
- **Create Invite Code** button (generates unique code).
- List of active teams with:
  - Team name
  - Invite code
  - Number of students connected
  - Current progress (which room they’re on)
  - Current roster status (how many soldiers alive)
- Ability to reset a team or the entire campaign.

**D. Live Monitoring (Optional Advanced)**
- Overview of all active groups:
  - Which boss they’re fighting
  - Current round
  - Rough win probability estimate (based on tokens used so far)
- “Force Next Round” or “Pause All Games” controls (for pacing the class).

---

## 5. Screen Flow & Navigation

**Student Flow**:
1. Join screen → Enter invite code
2. Team lobby (see current roster + HP status)
3. Combat screen (main gameplay)
4. Post-fight summary (HP carried over, tokens used, etc.)

**Teacher Flow**:
1. Dashboard (default)
2. Grade Input → Generate pool
3. Pick Boss
4. Monitor ongoing fights (optional)

---

## 6. Technical & Implementation Notes

- **Multiplayer Sync**: Lightweight WebSocket or Firebase-style realtime database for shared team state (magnet position, HP, tokens, DoTs).
- **State Persistence**: Team data (roster HP, progress) stored server-side until final boss or teacher reset.
- **Responsive**: Must work well on Chromebooks (touch + keyboard input for magnet).
- **Accessibility**:
  - Large clickable numbers (1–6) for magnet control.
  - High contrast mode option.
  - Screen reader friendly labels.
- **Performance**: Keep animations lightweight. Use CSS transitions + simple Canvas for token particles if needed.

---

## 7. Future UI Expansions

- Character detail pop-ups (hover/click for full token effect descriptions).
- Animated “story” text between rooms (lore unlocks).
- Spectator mode for teacher projection.
- Mobile-friendly version for phones (smaller layout).

---

**End of UI Specification**

This document focuses on layout, visual language, and interaction patterns. It can be used alongside the main mechanics spec to guide frontend development.

---

## 8. Animations, Visual Effects & Sound (Recommended Scope)

### 8.1 Animation Philosophy
- Keep animations **simple and purposeful** — focused on clear feedback rather than cinematic quality.
- All characters remain in **consistent side/profile view**.
- Prioritize readability and performance on Chromebooks.
- Prefer **CSS transitions + transforms** over heavy sprite sheets where possible.

### 8.2 Recommended Core Animations (Start Here)

| Animation                  | Description                                      | Implementation                  | Priority |
|---------------------------|--------------------------------------------------|----------------------------------|----------|
| Idle / Breathing          | Gentle sway or breathing motion                  | CSS loop (2–3 frames)            | High     |
| Hit Reaction              | Quick flinch or recoil on damage                 | CSS scale + red flash            | High     |
| Action / Attack           | Character performs move (slash, cast, shoot)     | Short one-shot (4–6 frames)      | High     |
| DoT Visual State          | Pulsing icon or colored overlay showing active DoT | Small pulsing icon + color overlay | High     |
| Token Falling             | Grade tokens fall from cloud and get claimed     | CSS gravity + arc + glow         | High     |
| Token Magnet Movement     | Glowing rune circle slides under character       | Smooth CSS transition + pulse    | High     |
| Shield Break              | Party-wide shield cracks and disappears          | Cracking animation + particles   | Medium   |
| Death                     | Character slumps or fades                        | One-shot collapse + grayscale    | Medium   |
| Boss Attack               | Boss winds up and strikes                        | Anticipation + impact            | High     |
| Minion Attack             | Skeleton Archer fires toward magnet position     | Projectile arc + impact          | Medium   |

### 8.3 Technical Approach (Recommended for v1.0)

- **Primary method**: Single base images + CSS animations + effect overlays.
  - One main profile portrait per character.
  - Separate small images/overlays for weapons, spells, and effects.
  - Use CSS for hit reactions, pulses, and movement.
- **Avoid full traditional sprite sheets** in the first version (they are harder to generate consistently and more work to implement).
- **DoT Indicators**: Small colored pulsing icons or borders on the character (different style/color for Fire, Ice, Poison, Slime).
- **Grok Imagine** can be used to generate high-quality base character portraits and individual action poses. These can then be turned into simple animated effects via CSS.

### 8.4 Lighting & Atmosphere

- Subtle ambient flickering (torchlight or rune glow).
- Stronger localized glow/flash on big moments (powerful A tokens, F explosions, shield breaking).
- DoT characters get a gentle pulsing colored aura.
- Magnet has a stronger glow and subtle particle trail when active.

### 8.5 Sound Design

- Keep sounds minimal and classroom-friendly.
- UI feedback: Soft clicks, token drops, magnet slide.
- Actions: Short stylized whooshes, magical chimes, and light impacts.
- DoT ticks: Very subtle recurring sound (toggleable).
- Big moments: Slightly more dramatic but still restrained audio for major successes or disasters.
- Music: Optional low ambient dark fantasy track (easy to mute, with teacher master volume control).

### 8.6 Implementation Priority Order

1. Token falling + claiming animations
2. Token Magnet sliding + glow
3. Character hit reactions and basic action feedback
4. DoT visual indicators (icons + pulsing)
5. Boss and minion attack feedback
6. Shield breaking and death (secondary)
7. Lighting and atmospheric effects (polish)

This scope keeps development manageable while making the game feel responsive and alive.