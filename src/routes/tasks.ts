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

// GET /api/tasks — Returns authoritative tasks, counts, RPG progress, and gamification metadata
router.get("/", (req: Request, res: Response): void => {
  try {
    const state = taskStore.getState(extractFilter(req));
    res.json(state);
  } catch (error) {
    console.error("Error fetching authoritative galaxy state:", error);
    res.status(500).json({ error: "Failed to fetch galaxy state" });
  }
});

// POST /api/tasks — Validates input & assigns EXP reward strictly on the backend
router.post("/", (req: Request, res: Response): void => {
  try {
    const { title, description, category, scheduledAt } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      res.status(400).json({ error: "Mission title is required." });
      return;
    }

    if (!isValidCategory(category)) {
      res.status(400).json({
        error: "Category must be strictly 'Daily', 'Weekly', or 'Monthly'.",
      });
      return;
    }

    const parsedSchedule = new Date(scheduledAt);
    if (!scheduledAt || isNaN(parsedSchedule.getTime())) {
      res.status(400).json({ error: "A valid target Date & Time is required." });
      return;
    }

    const result = taskStore.createTask(
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
    console.error("Error creating task:", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// PUT /api/tasks/:id — Updates task parameters & recalculates EXP on the server
router.put("/:id", (req: Request, res: Response): void => {
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

    const result = taskStore.updateTask(
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
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (msg === "TASK_LOCKED") {
      res.status(409).json({ error: "Task is currently being processed" });
      return;
    }
    res.status(500).json({ error: "Failed to update task" });
  }
});

// PATCH /api/tasks/:id/toggle — Server-authoritative status toggle & EXP/Level calculation
router.patch("/:id/toggle", (req: Request, res: Response): void => {
  try {
    const id = String(req.params.id);
    const result = taskStore.toggleTaskStatus(id, extractFilter(req));
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "TASK_NOT_FOUND") {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    if (msg === "TASK_LOCKED") {
      res.status(409).json({ error: "Task toggle already in progress" });
      return;
    }
    res.status(500).json({ error: "Failed to toggle task status" });
  }
});

// PATCH /api/tasks/:id/notification — Registers the device's OS notification ID
router.patch("/:id/notification", (req: Request, res: Response): void => {
  try {
    const id = String(req.params.id);
    const { notificationId } = req.body;
    const result = taskStore.updateTask(
      id,
      { notificationId: notificationId ?? null },
      extractFilter(req)
    );
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "TASK_NOT_FOUND") {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.status(500).json({ error: "Failed to update notification reference" });
  }
});

// DELETE /api/tasks/:id — Deletes task on the server
router.delete("/:id", (req: Request, res: Response): void => {
  try {
    const id = String(req.params.id);
    const result = taskStore.deleteTask(id, extractFilter(req));
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "UNKNOWN";
    if (msg === "TASK_NOT_FOUND") {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.status(500).json({ error: "Failed to delete task" });
  }
});

export default router;
