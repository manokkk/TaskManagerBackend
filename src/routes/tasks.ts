import { Router, Request, Response } from "express";
import { isValidCategory } from "../services/gamificationEngine";
import { taskStore, TaskQueryFilter } from "../services/taskStore";

const router = Router();

function extractFilter(req: Request): TaskQueryFilter {
  return {
    category:
      typeof req.query.category === "string" ? req.query.category : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    search: typeof req.query.search === "string" ? req.query.search : undefined,
  };
}

// GET /api/tasks — Returns authoritative tasks from Supabase, counts, and RPG progress
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const state = await taskStore.getState(extractFilter(req));
    res.json(state);
  } catch (error) {
    console.error("Error fetching authoritative galaxy state from Supabase:", error);
    res.status(500).json({ error: "Failed to fetch galaxy state" });
  }
});

// POST /api/tasks — Validates input & saves directly to Supabase with server-calculated EXP
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, category, scheduledAt } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      res.status(400).json({ error: "Mission title is required." });
      return;
    }

    if (!isValidCategory(category)) {
      res.status(400).json({
        error: "Category must be strictly 'Daily', 'Weekly', 'Monthly', or 'Note'.",
      });
      return;
    }

    let parsedSchedule = scheduledAt ? new Date(scheduledAt) : new Date(NaN);
    if (!scheduledAt || isNaN(parsedSchedule.getTime())) {
      const target = new Date();
      if (category === "Daily") {
        target.setDate(target.getDate() + 1);
        target.setHours(0, 0, 0, 0);
      } else if (category === "Weekly") {
        target.setDate(target.getDate() + 7);
        target.setHours(0, 0, 0, 0);
      } else if (category === "Monthly") {
        target.setMonth(target.getMonth() + 1);
        target.setHours(0, 0, 0, 0);
      }
      parsedSchedule = target;
    }

    const result = await taskStore.createTask(
      {
        title,
        description: typeof description === "string" ? description : undefined,
        category,
        scheduledAt: parsedSchedule.toISOString(),
      },
      extractFilter(req)
    );

    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating task in Supabase:", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// PUT /api/tasks/:id — Updates task in Supabase & recalculates authoritative EXP on server
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { title, description, category, scheduledAt, notificationId } =
      req.body;

    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      res.status(400).json({ error: "Mission title cannot be empty." });
      return;
    }

    if (category !== undefined && !isValidCategory(category)) {
      res.status(400).json({
        error: "Category must be strictly 'Daily', 'Weekly', or 'Monthly'.",
      });
      return;
    }

    let normalizedSchedule: string | undefined;
    if (scheduledAt !== undefined) {
      const parsed = new Date(scheduledAt);
      if (isNaN(parsed.getTime())) {
        res.status(400).json({ error: "Invalid scheduledAt timestamp." });
        return;
      }
      normalizedSchedule = parsed.toISOString();
    }

    const result = await taskStore.updateTask(
      id,
      {
        title,
        description,
        category,
        scheduledAt: normalizedSchedule,
        notificationId,
      },
      extractFilter(req)
    );

    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "TASK_NOT_FOUND") {
      res.status(404).json({ error: "Task not found in Supabase" });
      return;
    }
    res.status(500).json({ error: "Failed to update task in Supabase" });
  }
});

// PATCH /api/tasks/:id/toggle — Server-authoritative status toggle & EXP/Level calculation in Supabase
router.patch("/:id/toggle", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const result = await taskStore.toggleTaskStatus(id, extractFilter(req));
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "TASK_NOT_FOUND") {
      res.status(404).json({ error: "Task not found in Supabase" });
      return;
    }
    res.status(500).json({ error: "Failed to toggle task status" });
  }
});

// PATCH /api/tasks/:id/notification — Registers the device's OS notification ID in Supabase
router.patch("/:id/notification", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { notificationId } = req.body;
    const result = await taskStore.updateTask(
      id,
      { notificationId: notificationId ?? null },
      extractFilter(req)
    );
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "TASK_NOT_FOUND") {
      res.status(404).json({ error: "Task not found in Supabase" });
      return;
    }
    res.status(500).json({ error: "Failed to update notification reference" });
  }
});

// DELETE /api/tasks/:id — Deletes task permanently from Supabase
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const result = await taskStore.deleteTask(id, extractFilter(req));
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "TASK_NOT_FOUND") {
      res.status(404).json({ error: "Task not found in Supabase" });
      return;
    }
    res.status(500).json({ error: "Failed to delete task from Supabase" });
  }
});

export default router;
