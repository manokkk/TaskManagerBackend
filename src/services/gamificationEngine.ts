import {
  GamificationMetadata,
  LevelCapSample,
  RankTier,
  RankTierDefinition,
  TaskCategory,
  UserProgress,
} from "../types/galaxy";

export const EXP_REWARDS: Readonly<Record<TaskCategory, number>> = {
  Daily: 30,
  Weekly: 20,
  Monthly: 10,
  Note: 0,
};

export const BASE_LEVEL_CAP = 100;
export const LEVEL_SCALING_FACTOR = 1.5;
export const MAX_LEVEL = 100;

export const RANK_TIER_DEFINITIONS: RankTierDefinition[] = [
  {
    rank: "Rookie",
    levelRange: "Level 1 – 20",
    minLevel: 1,
    maxLevel: 20,
    insignia: "🛰️",
  },
  {
    rank: "Veteran",
    levelRange: "Level 21 – 40",
    minLevel: 21,
    maxLevel: 40,
    insignia: "🚀",
  },
  {
    rank: "Elite",
    levelRange: "Level 41 – 60",
    minLevel: 41,
    maxLevel: 60,
    insignia: "☄️",
  },
  {
    rank: "Master",
    levelRange: "Level 61 – 80",
    minLevel: 61,
    maxLevel: 80,
    insignia: "🌟",
  },
  {
    rank: "Legendary",
    levelRange: "Level 81 – 100",
    minLevel: 81,
    maxLevel: 100,
    insignia: "👑",
  },
];

/**
 * Server-authoritative 1.5x scaling formula:
 * Next Level Cap = Math.floor(Current Level Cap * 1.5)
 */
export function getNextLevelCap(currentLevelCap: number): number {
  return Math.floor(currentLevelCap * LEVEL_SCALING_FACTOR);
}

/**
 * Resolves the player's Rank Tier strictly on the backend:
 * - Level 1 to 20: Rookie
 * - Level 21 to 40: Veteran
 * - Level 41 to 60: Elite
 * - Level 61 to 80: Master
 * - Level 81 to 100: Legendary
 */
export function getRankForLevel(level: number): RankTier {
  if (level <= 20) return "Rookie";
  if (level <= 40) return "Veteran";
  if (level <= 60) return "Elite";
  if (level <= 80) return "Master";
  return "Legendary";
}

export function isValidCategory(value: unknown): value is TaskCategory {
  return (
    value === "Daily" ||
    value === "Weekly" ||
    value === "Monthly" ||
    value === "Note"
  );
}

export function getAuthoritativeExpReward(category: TaskCategory): number {
  return EXP_REWARDS[category];
}

/**
 * Deterministically computes the complete UserProgress payload from cumulative `totalExp`
 * on the backend. The mobile frontend never calculates EXP, levels, or ranks locally.
 */
export function calculateAuthoritativeProgress(rawTotalExp: number): UserProgress {
  const totalExp = Math.max(0, Math.floor(rawTotalExp));
  let level = 1;
  let remainingExp = totalExp;
  let currentCap = BASE_LEVEL_CAP;

  while (remainingExp >= currentCap && level < MAX_LEVEL) {
    remainingExp -= currentCap;
    level += 1;
    currentCap = getNextLevelCap(currentCap);
  }

  const isMaxLevel = level >= MAX_LEVEL && remainingExp >= currentCap;
  const progressPercentage = isMaxLevel
    ? 100
    : Math.min(100, Math.max(0, Math.round((remainingExp / currentCap) * 100)));

  return {
    totalExp,
    level,
    currentLevelExp: remainingExp,
    nextLevelCap: currentCap,
    followingLevelCap: getNextLevelCap(currentCap),
    rank: getRankForLevel(level),
    progressPercentage,
  };
}

function buildSampleLevelCaps(count: number): LevelCapSample[] {
  const rows: LevelCapSample[] = [];
  let currentCap = BASE_LEVEL_CAP;
  for (let lvl = 1; lvl <= count; lvl++) {
    rows.push({ level: lvl, cap: currentCap });
    currentCap = getNextLevelCap(currentCap);
  }
  return rows;
}

const CACHED_SAMPLE_CAPS = buildSampleLevelCaps(6);

export function getGamificationMetadata(): GamificationMetadata {
  return {
    expRewards: { ...EXP_REWARDS },
    rankTiers: RANK_TIER_DEFINITIONS,
    sampleLevelCaps: CACHED_SAMPLE_CAPS,
  };
}

