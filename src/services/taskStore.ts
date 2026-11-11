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

const INITIAL_BACKEND_TASKS = [
  {
    title: "Complete 45-Minute Deep Work Sprint",
    description: "Zero distractions in the command deck. Ship core module architecture.",
    category: "Daily",
    status: "Pending",
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    expReward: getAuthoritativeExpReward("Daily"),
  },
  {
    title: "Weekly Systems & Codebase Audit",
    description: "Review PRs, verify notification triggers, and benchmark performance.",
    category: "Weekly",
    status: "Pending",
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    expReward: getAuthoritativeExpReward("Weekly"),
  },
  {
    title: "Monthly Milestone & Architecture Retrospective",
    description: "Evaluate monthly sprint velocity and calibrate next cycle objectives.",
    category: "Monthly",
    status: "Done",
    scheduledAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    expReward: getAuthoritativeExpReward("Monthly"),
  },
];

let seeded = false;
async function ensureSeedData() {
  if (seeded) return;
  try {
    const count = await prisma.task.count();
    if (count === 0) {
      console.log("🌱 Seeding initial missions to Supabase Task table...");
      for (const t of INITIAL_BACKEND_TASKS) {
        await prisma.task.create({ data: t });
      }
    }
    seeded = true;
  } catch (err) {
    console.error("Warning: could not verify seed data in Supabase:", err);
  }
}

export interface TaskQueryFilter {
  category?: string;
  status?: string;
  search?: string;
  userId?: string;
}

function mapPrismaTask(t: any): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? undefined,
    category: t.category as TaskCategory,
    status: t.status as TaskStatus,
    scheduledAt: t.scheduledAt instanceof Date ? t.scheduledAt.toISOString() : new Date(t.scheduledAt).toISOString(),
    notificationId: t.notificationId,
    expReward: t.expReward,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : new Date(t.createdAt).toISOString(),
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : new Date(t.updatedAt).toISOString(),
  };
}

async function buildAuthoritativeState(filter?: TaskQueryFilter): Promise<GalaxyStateResponse> {
  await ensureSeedData();

  // Fetch all tasks to compute authoritative counts and global EXP
  const allTasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
  });

  const totalExp = allTasks.reduce(
    (sum, t) => (t.status === "Done" ? sum + t.expReward : sum),
    0
  );

  const counts = {
    All: allTasks.length,
    Daily: allTasks.filter((t) => t.category === "Daily").length,
    Weekly: allTasks.filter((t) => t.category === "Weekly").length,
    Monthly: allTasks.filter((t) => t.category === "Monthly").length,
    Note: allTasks.filter((t) => t.category === "Note").length,
    Completed: allTasks.filter((t) => t.status === "Done").length,
    Total: allTasks.length,
  };

  // Build filtered list for the client view
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

export const taskStore = {
  async getState(filter?: TaskQueryFilter): Promise<GalaxyStateResponse> {
    return await buildAuthoritativeState(filter);
  },

  async getTaskById(id: string): Promise<Task | null> {
    const task = await prisma.task.findUnique({ where: { id } });
    return task ? mapPrismaTask(task) : null;
  },

  async createTask(
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
      },
    });

    const state = await buildAuthoritativeState(filter);
    return {
      task: mapPrismaTask(created),
      state,
    };
  },

  async updateTask(
    id: string,
    payload: UpdateTaskPayload,
    filter?: TaskQueryFilter
  ): Promise<{ task: Task; state: GalaxyStateResponse }> {
    const existing = await prisma.task.findUnique({ where: { id } });
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

    const state = await buildAuthoritativeState(filter);
    return {
      task: mapPrismaTask(updated),
      state,
    };
  },

  async toggleTaskStatus(
    id: string,
    filter?: TaskQueryFilter
  ): Promise<{ task: Task; state: GalaxyStateResponse }> {
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      throw new Error("TASK_NOT_FOUND");
    }

    const nextStatus = existing.status === "Pending" ? "Done" : "Pending";
    const authoritativeReward = getAuthoritativeExpReward(existing.category as TaskCategory);

    const updated = await prisma.task.update({
      where: { id },
      data: {
        status: nextStatus,
        expReward: authoritativeReward,
        notificationId: nextStatus === "Done" ? null : existing.notificationId,
      },
    });

    const state = await buildAuthoritativeState(filter);
    return {
      task: mapPrismaTask(updated),
      state,
    };
  },

  async deleteTask(
    id: string,
    filter?: TaskQueryFilter
  ): Promise<{ deletedTask: Task; state: GalaxyStateResponse }> {
    const existing = await prisma.task.findUnique({ where: { id } });
    if (!existing) {
      throw new Error("TASK_NOT_FOUND");
    }

    await prisma.task.delete({ where: { id } });

    const state = await buildAuthoritativeState(filter);
    return {
      deletedTask: mapPrismaTask(existing),
      state,
    };
  },
};
