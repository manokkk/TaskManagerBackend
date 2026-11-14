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

async function buildAuthoritativeState(
  userId: string,
  filter?: TaskQueryFilter
): Promise<GalaxyStateResponse> {
  // Fetch strictly this authenticated user's tasks & notes from Supabase
  const allTasks = await prisma.task.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const totalExp = allTasks.reduce(
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
    progress: calculateAuthoritativeProgress(totalExp),
    metadata: getGamificationMetadata(),
  };
}

async function syncUserTotalExp(userId: string, totalExp: number): Promise<void> {
  await prisma.user
    .update({
      where: { id: userId },
      data: { totalExp },
    })
    .catch(() => {
      // Non-fatal if user was concurrently deleted
    });
}

export const taskStore = {
  async getState(
    userId: string,
    filter?: TaskQueryFilter
  ): Promise<GalaxyStateResponse> {
    return await buildAuthoritativeState(userId, filter);
  },

  async createTask(
    userId: string,
    payload: CreateTaskPayload,
    filter?: TaskQueryFilter
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

    const state = await buildAuthoritativeState(userId, filter);
    return {
      task: mapPrismaTask(created),
      state,
    };
  },

  async updateTask(
    userId: string,
    id: string,
    payload: UpdateTaskPayload,
    filter?: TaskQueryFilter
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

    const state = await buildAuthoritativeState(userId, filter);
    await syncUserTotalExp(userId, state.progress.totalExp);
    return {
      task: mapPrismaTask(updated),
      state,
    };
  },

  async toggleTaskStatus(
    userId: string,
    id: string,
    filter?: TaskQueryFilter
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

    const state = await buildAuthoritativeState(userId, filter);
    await syncUserTotalExp(userId, state.progress.totalExp);
    return {
      task: mapPrismaTask(updated),
      state,
    };
  },

  async deleteTask(
    userId: string,
    id: string,
    filter?: TaskQueryFilter
  ): Promise<{ deletedTask: Task; state: GalaxyStateResponse }> {
    const existing = await prisma.task.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new Error("TASK_NOT_FOUND");
    }

    await prisma.task.delete({ where: { id } });

    const state = await buildAuthoritativeState(userId, filter);
    await syncUserTotalExp(userId, state.progress.totalExp);
    return {
      deletedTask: mapPrismaTask(existing),
      state,
    };
  },
};
