import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import tasksRouter from "./routes/tasks";
import authRouter from "./routes/auth";
import { prisma } from "./prisma";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const HOST = "0.0.0.0";

app.use(cors());
app.use(express.json());

// Health check endpoint (probes Supabase database connection)
app.get("/api/health", async (_req: Request, res: Response) => {
  let database = "connected";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err: any) {
    database = `error: ${err?.message || "unreachable"}`;
  }

  res.json({
    status: "ok",
    database,
    engine: "Galaxy RPG Authoritative Backend",
    timestamp: new Date().toISOString(),
  });
});

// Auth Routes (Sign Up & Log In with Supabase)
app.use("/api/auth", authRouter);

// Authoritative Tasks & Gamification Engine API
app.use("/api/tasks", tasksRouter);

app.listen(PORT, HOST, () => {
  console.log(`🚀 Galaxy RPG Backend running on port ${PORT}`);
  console.log(`📡 Local: http://localhost:${PORT}/api/health`);
  console.log(`📡 Network: http://192.168.100.51:${PORT}/api/health`);
  console.log(`🔐 Supabase Auth API: http://localhost:${PORT}/api/auth`);
  console.log(`📋 Authoritative Tasks & EXP API: http://localhost:${PORT}/api/tasks`);
});
