import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import tasksRouter from "./routes/tasks";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    engine: "Galaxy RPG Authoritative Backend",
    timestamp: new Date().toISOString(),
  });
});

// Authoritative Tasks & Gamification Engine API
app.use("/api/tasks", tasksRouter);

app.listen(PORT, () => {
  console.log(`🚀 Galaxy RPG Backend running on http://localhost:${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📋 Authoritative Tasks & EXP API: http://localhost:${PORT}/api/tasks`);
});
