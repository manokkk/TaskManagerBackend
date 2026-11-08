export type TaskCategory = "Daily" | "Weekly" | "Monthly";
export type TaskStatus = "Pending" | "Done";
export type RankTier = "Rookie" | "Veteran" | "Elite" | "Master" | "Legendary";

export interface Task {
  id: string;
  title: string;
  description?: string;
  category: TaskCategory;
  status: TaskStatus;
  scheduledAt: string;
  notificationId?: string | null;
  expReward: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  category: TaskCategory;
  scheduledAt: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  category?: TaskCategory;
  scheduledAt?: string;
  notificationId?: string | null;
}

export interface UserProgress {
  totalExp: number;
  level: number;
  currentLevelExp: number;
  nextLevelCap: number;
  followingLevelCap: number;
  rank: RankTier;
  progressPercentage: number;
}

export interface RankTierDefinition {
  rank: RankTier;
  levelRange: string;
  minLevel: number;
  maxLevel: number;
  insignia: string;
}

export interface LevelCapSample {
  level: number;
  cap: number;
}

export interface GamificationMetadata {
  expRewards: Record<TaskCategory, number>;
  rankTiers: RankTierDefinition[];
  sampleLevelCaps: LevelCapSample[];
}

export interface GalaxyStateResponse {
  tasks: Task[];
  counts: {
    All: number;
    Daily: number;
    Weekly: number;
    Monthly: number;
    Completed: number;
    Total: number;
  };
  progress: UserProgress;
  metadata: GamificationMetadata;
}

