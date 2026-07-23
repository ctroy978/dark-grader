import type { BossScout } from "@dungeon-grades/shared";

export type CodexBoss = {
  id: string;
  name: string;
  maxHp: number;
  difficulty: string;
  summary: string;
  recommendedRounds: string;
  traits: string[];
  /** 0-based campaign room index, or -1 if not on default path */
  roomIndex: number;
  scout: BossScout | null;
};

export type CodexBossesResponse = {
  campaignBossIds: string[];
  bosses: CodexBoss[];
};

export async function fetchCodexBosses(): Promise<CodexBossesResponse> {
  const res = await fetch("/api/codex/bosses");
  if (!res.ok) {
    throw new Error("Could not load boss codex");
  }
  return res.json() as Promise<CodexBossesResponse>;
}
