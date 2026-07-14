# Initial Development Prompt — Dungeon Grades

You are an expert full-stack developer helping build a classroom game called **Dungeon Grades**.

## Project Overview

**Dungeon Grades** is a browser-based multiplayer game for high school students. After taking a test, students use their class grades (A–F) as power tokens to guide a party of fantasy soldiers through dungeon rooms. One room = one test. The game runs in groups of 3 students per team on Chromebooks.

**Core Loop**:
- Teacher inputs test grades → generates a pool of A–F tokens.
- Students choose 6 soldiers out of ~20 and arrange them in a line.
- Each round: 3 tokens drop. Students control a **Token Magnet** to influence who claims the tokens.
- Characters only act if they claim a token. Token grade heavily modifies their action.
- Boss fights with modular attacks and adds.
- Persistent campaign: HP carries over between rooms with limited healing.

**Key Features**:
- Student-controlled **Token Magnet** (click 1–6)
- Dynamic grade token cloud that drops 3 tokens per round
- 4 types of DoTs with unique mechanics
- 9 specialist archetypes with detailed token effects
- Modular boss system
- Teacher dashboard for grade input, boss selection, and team management

## Reference Documents

You have access to two detailed specification files in this folder:

1. **Dungeon_Grades_Game_Spec.md** — Complete mechanics, numerical values, specialist abilities, DoT system, combat loop, and a sample boss (Bone Colossus).
2. **Dungeon_Grades_UI_Spec.md** — Layout, visual style, animations, teacher UI, and interaction design.

**Read both files thoroughly** before starting any implementation.

## Development Guidelines

- **Target Platform**: Modern browsers on Chromebooks (groups of 3 students per team).
- **Multiplayer**: Lightweight real-time sync for team state (magnet position, HP, tokens, DoTs).
- **Persistence**: Team progress and soldier HP should persist until the final boss or teacher reset.
- **Performance**: Keep animations and effects lightweight.
- **Style**: Dark fantasy with glowing runes and magic effects (inspired by Darkest Dungeon but classroom-appropriate).

## Recommended Starting Approach

Please begin by doing the following in order:

1. **Confirm Understanding**  
   Summarize the core loop, Token Magnet mechanic, and how grade tokens affect characters. Ask any clarifying questions before coding.

2. **Project Structure**  
   Propose a clean folder structure and tech stack (recommended: React + TypeScript + Tailwind + lightweight real-time backend such as Firebase, Supabase, or Node + Socket.io).

3. **Core Data Models**  
   Define the main TypeScript interfaces/types based on the specs (Soldier, Token, DoT, Boss, TeamState, etc.).

4. **Combat Loop Foundation**  
   Build the core round loop first:
   - Token dropping from cloud
   - Token Magnet positioning (click 1–6)
   - Claim resolution with probabilities
   - Character actions based on claimed token
   - Simple boss action

5. **Visual Foundation**  
   Create the main combat layout (party on left, boss on right, middle gap for minions, glowing Token Magnet, grade token cloud above).

Once the above foundation is solid, we can iterate on:
- Full specialist abilities and DoT interactions
- Boss system and minions
- Teacher dashboard
- Animations and polish
- Persistence and multiplayer

## Important Notes

- Start **simple but correct**. We can add visual polish and advanced features later.
- Use the exact numbers and rules from the Game Spec.
- Keep the code clean, well-commented, and modular.
- Prioritize the student experience (especially the Token Magnet interaction).

---

**Ready when you are.** Please begin by reading both specification files and confirming your understanding of the core mechanics. Then propose the initial project structure and tech stack.