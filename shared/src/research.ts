import { TOWERS, type TowerKind } from './index';
export const REWARD_XP = 100;
export const REWARD_RESEARCH = 50;
export const MAX_RESEARCH_RANK = 15;
export type ResearchRanks = Partial<Record<TowerKind, number>>;
export interface ProgressReward {
  xp: number;
  research: number;
  missionId: string;
  wave: number;
}
// Additive gains per research step. Purchase prices and in-battle upgrade costs stay fixed.
export const RESEARCH_GAINS: Record<
  TowerKind,
  { damage: number; attacks: number; range: number; splash: number }
> = {
  inferno: { damage: 0.04, attacks: 0.005, range: 0.003, splash: 0 },
  venom: { damage: 0.04, attacks: 0.005, range: 0.003, splash: 0.008 },
  frost: { damage: 0.03, attacks: 0.008, range: 0.004, splash: 0.008 },
  ballista: { damage: 0.04, attacks: 0.008, range: 0.003, splash: 0 },
  arcane: { damage: 0.05, attacks: 0.005, range: 0.003, splash: 0 },
  fire: { damage: 0.035, attacks: 0.006, range: 0.002, splash: 0.008 },
  grenade: { damage: 0.04, attacks: 0.005, range: 0.003, splash: 0.01 },
  sniper: { damage: 0.055, attacks: 0.004, range: 0.004, splash: 0 },
  repeater: { damage: 0.03, attacks: 0.012, range: 0.002, splash: 0 },
  runemortar: { damage: 0.04, attacks: 0.005, range: 0.003, splash: 0.008 },
  prism: { damage: 0.055, attacks: 0.004, range: 0.004, splash: 0 },
  ember: { damage: 0.035, attacks: 0.01, range: 0.003, splash: 0 },
  meteor: { damage: 0.05, attacks: 0.003, range: 0.002, splash: 0.01 },
};
export function researchCost(rank: number) {
  return rank >= MAX_RESEARCH_RANK ? 0 : 25 + rank * 10;
}
export function researchSpent(ranks: ResearchRanks) {
  return Object.values(ranks).reduce((sum, rank) => sum + rank * 25 + 5 * rank * (rank - 1), 0);
}
export function validXp(xp: unknown): xp is number {
  return Number.isSafeInteger(xp) && Number(xp) >= 0 && Number(xp) <= 1_000_000_000;
}
export function validResearch(ranks: unknown, xp: number): ranks is ResearchRanks {
  return (
    !!ranks &&
    typeof ranks === 'object' &&
    !Array.isArray(ranks) &&
    Object.entries(ranks).every(
      ([kind, rank]) =>
        Object.hasOwn(TOWERS, kind) && Number.isInteger(rank) && rank >= 0 && rank <= MAX_RESEARCH_RANK,
    ) &&
    researchSpent(ranks as ResearchRanks) <= Math.floor(xp / REWARD_XP) * REWARD_RESEARCH
  );
}
export function availableResearch(xp: number, ranks: ResearchRanks) {
  return Math.floor(xp / REWARD_XP) * REWARD_RESEARCH - researchSpent(ranks);
}
