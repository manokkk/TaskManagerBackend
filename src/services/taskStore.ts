import {
  CreateTaskPayload,
  GalaxyStateResponse,
  Task,
  TaskStatus,
  UpdateTaskPayload,
} from "../types/galaxy";
import {
  calculateAuthoritativeProgress,
  getAuthoritativeExpReward,
  getGamificationMetadata,
} from "./gamificationEngine";

const now = Date.now();

const INITIAL_BACKEND_TASKS: Task[] = [
  {
    id: "mission-daily-1",
    title: "Complete 45-Minute Deep Work Sprint",
    description: "Zero distractions in the command deck. Ship core module architecture.",
    category: "Daily",
    status: "Pending",
    scheduledAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    notificationId: null,
    expReward: getAuthoritativeExpReward("Daily"),
    createdAt: new Date(now - 3600000).toISOString(),
    updatedAt: new Date(now - 3600000).toISOString(),
  },
  {
    id: "mission-weekly-1",
    title: "Weekly Systems & Codebase Audit",
    description: "Review PRs, verify notification triggers, and benchmark performance.",
    category: "Weekly",
    status: "Pending",
    scheduledAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    notificationId: null,
    expReward: getAuthoritativeExpReward("Weekly"),
    createdAt: new Date(now - 7200000).toISOString(),
    updatedAt: new Date(now - 7200000).toISOString(),
  },
  {
    id: "mission-monthly-1",
    title: "Monthly Milestone & Architecture Retrospective",
    description: "Evaluate monthly sprint velocity and calibrate next cycle objectives.",
    category: "Monthly",
    status: "Done",
    scheduledAt: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
    notificationId: null,
    expReward: getAuthoritativeExpReward("Monthly"),
    createdAt: new Date(now - 86400000).toISOString(),
    updatedAt: new Date(now - 3600000).toISOString(),
  },
];

let serverTasks: Task[] = [...INITIAL_BACKEND_TASKS];
let serverTotalExp: number = serverTasks.reduce(
  (sum, t) => (t.status === "Done" ? sum + t.expReward : sum),
  0
);

// Per-task mutex on the backend to serialize rapid toggle/update requests
const taskOperationLocks = new Set<string>();

export interface TaskQueryFilter {
  category?: string;
  status?: string;
  search?: string;
}

function buildAuthoritativeState(filter?: TaskQueryFilter): GalaxyStateResponse {
  let filtered = [...serverTasks];

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

  const counts = {
    All: serverTasks.length,
    Daily: serverTasks.filter((t) => t.category === "Daily").length,
    Weekly: serverTasks.filter((t) => t.category === "Weekly").length,
    Monthly: serverTasks.filter((t) => t.category === "Monthly").length,
    Completed: serverTasks.filter((t) => t.status === "Done").length,
    Total: serverTasks.length,
  };

  return {
    tasks: filtered,
    counts,
    progress: calculateAuthoritativeProgress(serverTotalExp),
    metadata: getGamificationMetadata(),
  };
}

export const taskStore = {
  getState(filter?: TaskQueryFilter): GalaxyStateResponse {
    return buildAuthoritativeState(filter);
  },

  getTaskById(id: string): Task | undefined {
    return serverTasks.find((t) => t.id === id);
  },

  createTask(
    payload: CreateTaskPayload,
    filter?: TaskQueryFilter
  ): { task: Task; state: GalaxyStateResponse } {
    const nowIso = new Date().toISOString();
    const expReward = getAuthoritativeExpReward(payload.category);

    const newTask: Task = {
      id: `mission-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: payload.title.trim(),
      description: payload.description?.trim() || undefined,
      category: payload.category,
      status: "Pending",
      scheduledAt: payload.scheduledAt,
      notificationId: null,
      expReward,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    serverTasks = [newTask, ...serverTasks];
    return {
      task: newTask,
      state: buildAuthoritativeState(filter),
    };
  },

  updateTask(
    id: string,
    payload: UpdateTaskPayload,
    filter?: TaskQueryFilter
  ): { task: Task; state: GalaxyStateResponse } {
    if (taskOperationLocks.has(id)) {
      throw new Error("TASK_LOCKED");
    }

    taskOperationLocks.add(id);
    try {
      const idx = serverTasks.findIndex((t) => t.id === id);
      if (idx === -1) {
        throw new Error("TASK_NOT_FOUND");
      }

      const existing = serverTasks[idx];
      const nextCategory = payload.category ?? existing.category;
      const nextExpReward = getAuthoritativeExpReward(nextCategory);

      // Reconcile serverTotalExp if a completed task's category changed
      if (existing.status === "Done" && existing.expReward !== nextExpReward) {
        serverTotalExp = Math.max(
          0,
          serverTotalExp + (nextExpReward - existing.expReward)
        );
      }

      const updated: Task = {
        ...existing,
        title:
          payload.title !== undefined ? payload.title.trim() : existing.title,
        description:
          payload.description !== undefined
            ? payload.description.trim() || undefined
            : existing.description,
        category: nextCategory,
        scheduledAt: payload.scheduledAt ?? existing.scheduledAt,
        notificationId:
          payload.notificationId !== undefined
            ? payload.notificationId
            : existing.notificationId,
        expReward: nextExpReward,
        updatedAt: new Date().toISOString(),
      };

      serverTasks[idx] = updated;
      return {
        task: updated,
        state: buildAuthoritativeState(filter),
      };
    } finally {
      taskOperationLocks.delete(id);
    }
  },

  toggleTaskStatus(
    id: string,
    filter?: TaskQueryFilter
  ): { task: Task; state: GalaxyStateResponse } {
    if (taskOperationLocks.has(id)) {
      throw new Error("TASK_LOCKED");
    }

    taskOperationLocks.add(id);
    try {
      const idx = serverTasks.findIndex((t) => t.id === id);
      if (idx === -1) {
        throw new Error("TASK_NOT_FOUND");
      }

      const existing = serverTasks[idx];
      const nextStatus: TaskStatus =
        existing.status === "Pending" ? "Done" : "Pending";
      const authoritativeReward = getAuthoritativeExpReward(existing.category);
      const expDelta =
        nextStatus === "Done" ? authoritativeReward : -authoritativeReward;

      serverTotalExp = Math.max(0, serverTotalExp + expDelta);

      const updated: Task = {
        ...existing,
        status: nextStatus,
        expReward: authoritativeReward,
        notificationId: nextStatus === "Done" ? null : existing.notificationId,
        updatedAt: new Date().toISOString(),
      };

      serverTasks[idx] = updated;
      return {
        task: updated,
        state: buildAuthoritativeState(filter),
      };
    } finally {
      taskOperationLocks.delete(id);
    }
  },

  deleteTask(
    id: string,
    filter?: TaskQueryFilter
  ): { deletedTask: Task; state: GalaxyStateResponse } {
    if (taskOperationLocks.has(id)) {
      throw new Error("TASK_LOCKED");
    }

    taskOperationLocks.add(id);
    try {
      const existing = serverTasks.find((t) => t.id === id);
      if (!existing) {
        throw new Error("TASK_NOT_FOUND");
      }

      serverTasks = serverTasks.filter((t) => t.id !== id);
      return {
        deletedTask: existing,
        state: buildAuthoritativeState(filter),
      };
    } finally {
      taskOperationLocks.delete(id);
    }
  },
};

