import { Router, Response } from "express";
import { isValidCategory } from "../services/gamificationEngine";
import { taskStore, TaskQueryFilter } from "../services/taskStore";
import { AuthenticatedRequest, requireAuth } from "../middleware/auth";

const router = Router();

// All /api/tasks & notes routes require a valid authenticated user JWT
router.use(requireAuth);

function extractFilter(req: AuthenticatedRequest): TaskQueryFilter {
  return {
    category:
      typeof req.query.category === "string" ? req.query.category : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    search: typeof req.query.search === "string" ? req.query.search : undefined,
  };
}

// GET /api/tasks — Returns authenticated user's tasks, notes, counts, and RPG progress
router.get(
  "/",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const state = await taskStore.getState(req.userId!, extractFilter(req));
      res.json(state);
    } catch (error) {
      console.error(
        "Error fetching authoritative galaxy state from Supabase:",
        error
      );
      res.status(500).json({ error: "Failed to fetch galaxy state" });
    }
  }
);

// POST /api/tasks — Validates input & saves directly to Supabase scoped to userId
router.post(
  "/",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { title, description, category, scheduledAt } = req.body;

      if (!title || typeof title !== "string" || !title.trim()) {
        res.status(400).json({ error: "Mission title is required." });
        return;
      }

      if (!isValidCategory(category)) {
        res.status(400).json({
          error:
            "Category must be strictly 'Daily', 'Weekly', 'Monthly', or 'Note'.",
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
        req.userId!,
        {
          title,
          description:
            typeof description === "string" ? description : undefined,
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
  }
);

// PUT /api/tasks/:id — Updates user's task/note in Supabase
router.put(
  "/:id",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const { title, description, category, scheduledAt, notificationId } =
        req.body;

      if (title !== undefined && (typeof title !== "string" || !title.trim())) {
        res.status(400).json({ error: "Title cannot be empty." });
        return;
      }

      if (category !== undefined && !isValidCategory(category)) {
        res.status(400).json({
          error:
            "Category must be strictly 'Daily', 'Weekly', 'Monthly', or 'Note'.",
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
        req.userId!,
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
  }
);

// PATCH /api/tasks/:id/toggle — Server-authoritative status toggle & EXP/Level calculation
router.patch(
  "/:id/toggle",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const result = await taskStore.toggleTaskStatus(
        req.userId!,
        id,
        extractFilter(req)
      );
      res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "UNKNOWN";
      if (msg === "TASK_NOT_FOUND") {
        res.status(404).json({ error: "Task not found in Supabase" });
        return;
      }
      res.status(500).json({ error: "Failed to toggle task status" });
    }
  }
);

// PATCH /api/tasks/:id/notification — Registers the device's OS notification ID
router.patch(
  "/:id/notification",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const { notificationId } = req.body;
      const result = await taskStore.updateTask(
        req.userId!,
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
  }
);

// DELETE /api/tasks/:id — Deletes user's task/note permanently
router.delete(
  "/:id",
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const id = String(req.params.id);
      const result = await taskStore.deleteTask(
        req.userId!,
        id,
        extractFilter(req)
      );
      res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "UNKNOWN";
      if (msg === "TASK_NOT_FOUND") {
        res.status(404).json({ error: "Task not found in Supabase" });
        return;
      }
      res.status(500).json({ error: "Failed to delete task from Supabase" });
    }
  }
);

export default router;
