import {
  CreateTaskPayload,
  GalaxyStateResponse,
  Task,
  TaskCategory,
  TaskStatus,
  UpdateTaskPayload,
} from "../types/galaxy";
import {
  calculateAuthoritativeProgress,
  getAuthoritativeExpReward,
  getGamificationMetadata,
} from "./gamificationEngine";
import { prisma } from "../prisma";

export interface TaskQueryFilter {
  category?: string;
  status?: string;
  search?: string;
}

function mapPrismaTask(t: any): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    category: t.category as TaskCategory,
    status: t.status as TaskStatus,
    scheduledAt:
      t.scheduledAt instanceof Date
        ? t.scheduledAt.toISOString()
        : new Date(t.scheduledAt).toISOString(),
    notificationId: t.notificationId,
    expReward: t.expReward,
    createdAt:
      t.createdAt instanceof Date
        ? t.createdAt.toISOString()
        : new Date(t.createdAt).toISOString(),
    updatedAt:
      t.updatedAt instanceof Date
        ? t.updatedAt.toISOString()
        : new Date(t.updatedAt).toISOString(),
  };
}

function getUtcDateKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDateKey(value?: string): string {
  const now = new Date();
  const serverUtcKey = getUtcDateKey(now);

  if (typeof value !== "string") {
    return serverUtcKey;
  }

  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return serverUtcKey;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidateMs = Date.UTC(year, month - 1, day);
  const check = new Date(candidateMs);

  // Reject impossible calendar dates (e.g. 2026-02-31)
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return serverUtcKey;
  }

  // Clamp client-supplied local date to within +-1 day of server UTC date
  // to cover all real-world timezones while preventing EOD EXP replay/farming.
  const serverUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  if (Math.abs(candidateMs - serverUtcMs) > ONE_DAY_MS) {
    return serverUtcKey;
  }

  return trimmed;
}

/**
 * At the end of each calendar day, adds EXP from all tasks completed that day
 * to User.totalExp, records lastSettledDate, and resets completed tasks to Pending.
 */
async function settleAndGetUserTotalExp(
  userId: string,
  todayKey: string
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { totalExp: true, lastSettledDate: true },
    });

    if (!user) {
      return 0;
    }

    if (!user.lastSettledDate) {
      await tx.user.update({
        where: { id: userId },
        data: { lastSettledDate: todayKey },
      });
      return user.totalExp;
    }

    if (user.lastSettledDate >= todayKey) {
      return user.totalExp;
    }

    const doneTasks = await tx.task.findMany({
      where: {
        userId,
        category: { not: "Note" },
        status: "Done",
      },
      select: { expReward: true },
    });

    const earnedExp = doneTasks.reduce((sum, t) => sum + t.expReward, 0);

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        totalExp: { increment: earnedExp },
        lastSettledDate: todayKey,
      },
      select: { totalExp: true },
    });

    if (doneTasks.length > 0) {
      await tx.task.updateMany({
        where: {
          userId,
          category: { not: "Note" },
          status: "Done",
        },
        data: {
          status: "Pending",
          notificationId: null,
        },
      });
    }

    return updatedUser.totalExp;
  });
}

async function buildAuthoritativeState(
  userId: string,
  filter?: TaskQueryFilter,
  localDateKey?: string
): Promise<GalaxyStateResponse> {
  const todayKey = normalizeDateKey(localDateKey);
  const settledTotalExp = await settleAndGetUserTotalExp(userId, todayKey);

  // Fetch strictly this authenticated user's tasks & notes from Supabase
  const allTasks = await prisma.task.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const pendingExp = allTasks.reduce(
    (sum, t) =>
      t.category !== "Note" && t.status === "Done" ? sum + t.expReward : sum,
    0
  );

  const nonNoteTasks = allTasks.filter((t) => t.category !== "Note");

  const counts = {
    All: allTasks.length,
    Daily: allTasks.filter((t) => t.category === "Daily").length,
    Weekly: allTasks.filter((t) => t.category === "Weekly").length,
    Monthly: allTasks.filter((t) => t.category === "Monthly").length,
    Note: allTasks.filter((t) => t.category === "Note").length,
    Completed: nonNoteTasks.filter((t) => t.status === "Done").length,
    Total: nonNoteTasks.length,
  };

  let filtered = allTasks;

  if (filter?.category && filter.category !== "All") {
    filtered = filtered.filter((t) => t.category === filter.category);
  }

  if (filter?.status && filter.status !== "All") {
    filtered = filtered.filter((t) => t.status === filter.status);
  }

  if (filter?.search && filter.search.trim() !== "") {
    const q = filter.search.trim().toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }

  return {
    tasks: filtered.map(mapPrismaTask),
    counts,
    progress: calculateAuthoritativeProgress(settledTotalExp, pendingExp),
    metadata: getGamificationMetadata(),
  };
}

export const taskStore = {
  async getState(
    userId: string,
    filter?: TaskQueryFilter,
    localDateKey?: string
  ): Promise<GalaxyStateResponse> {
    return await buildAuthoritativeState(userId, filter, localDateKey);
  },

  async createTask(
    userId: string,
    payload: CreateTaskPayload,
    filter?: TaskQueryFilter,
    localDateKey?: string
  ): Promise<{ task: Task; state: GalaxyStateResponse }> {
    const expReward = getAuthoritativeExpReward(payload.category);

    const created = await prisma.task.create({
      data: {
        title: payload.title.trim(),
        description: payload.description?.trim() || null,
        category: payload.category,
        status: "Pending",
        scheduledAt: new Date(payload.scheduledAt),
        expReward,
        userId,
      },
    });

    const state = await buildAuthoritativeState(userId, filter, localDateKey);
    return {
      task: mapPrismaTask(created),
      state,
    };
  },

  async updateTask(
    userId: string,
    id: string,
    payload: UpdateTaskPayload,
    filter?: TaskQueryFilter,
    localDateKey?: string
  ): Promise<{ task: Task; state: GalaxyStateResponse }> {
    const existing = await prisma.task.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new Error("TASK_NOT_FOUND");
    }

    const nextCategory = payload.category ?? (existing.category as TaskCategory);
    const nextExpReward = getAuthoritativeExpReward(nextCategory);

    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(payload.title !== undefined && { title: payload.title.trim() }),
        ...(payload.description !== undefined && {
          description: payload.description.trim() || null,
        }),
        ...(payload.category !== undefined && { category: payload.category }),
        ...(payload.scheduledAt !== undefined && {
          scheduledAt: new Date(payload.scheduledAt),
        }),
        ...(payload.notificationId !== undefined && {
          notificationId: payload.notificationId,
        }),
        expReward: nextExpReward,
      },
    });

    const state = await buildAuthoritativeState(userId, filter, localDateKey);
    return {
      task: mapPrismaTask(updated),
      state,
    };
  },

  async toggleTaskStatus(
    userId: string,
    id: string,
    filter?: TaskQueryFilter,
    localDateKey?: string
  ): Promise<{ task: Task; state: GalaxyStateResponse }> {
    const existing = await prisma.task.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new Error("TASK_NOT_FOUND");
    }

    const nextStatus = existing.status === "Pending" ? "Done" : "Pending";
    const authoritativeReward = getAuthoritativeExpReward(
      existing.category as TaskCategory
    );

    const updated = await prisma.task.update({
      where: { id },
      data: {
        status: nextStatus,
        expReward: authoritativeReward,
        notificationId: nextStatus === "Done" ? null : existing.notificationId,
      },
    });

    const state = await buildAuthoritativeState(userId, filter, localDateKey);
    return {
      task: mapPrismaTask(updated),
      state,
    };
  },

  async deleteTask(
    userId: string,
    id: string,
    filter?: TaskQueryFilter,
    localDateKey?: string
  ): Promise<{ deletedTask: Task; state: GalaxyStateResponse }> {
    const existing = await prisma.task.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new Error("TASK_NOT_FOUND");
    }

    await prisma.task.delete({ where: { id } });

    const state = await buildAuthoritativeState(userId, filter, localDateKey);
    return {
      deletedTask: mapPrismaTask(existing),
      state,
    };
  },
};
