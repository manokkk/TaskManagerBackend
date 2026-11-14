import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import tasksRouter from "./routes/tasks";
import authRouter from "./routes/auth";
import { prisma } from "./prisma";
import { getJwtSecret } from "./middleware/auth";
import { createRateLimiter } from "./middleware/rateLimit";

dotenv.config();

// Fail fast on startup in production if JWT_SECRET is missing
getJwtSecret();

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 5000;
const HOST = "0.0.0.0";

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.set("trust proxy", 1);
app.use(
  cors(
    allowedOrigins.length > 0
      ? { origin: allowedOrigins, credentials: true }
      : undefined
  )
);
app.use(express.json({ limit: "15mb" }));

const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 25,
  message: "Too many authentication attempts. Please wait 15 minutes and try again.",
});

// Health check endpoint (probes Supabase database connection)
app.get("/api/health", async (_req: Request, res: Response) => {
  let database = "connected";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err: any) {
    database = isProduction
      ? "unreachable"
      : `error: ${err?.message || "unreachable"}`;
  }

  const healthy = database === "connected";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    database,
    engine: "Galaxy RPG Authoritative Backend",
    timestamp: new Date().toISOString(),
  });
});

// Auth Routes (Sign Up & Log In with Supabase)
app.use("/api/auth/login", authRateLimit);
app.use("/api/auth/register", authRateLimit);
app.use("/api/auth", authRouter);

// Authoritative Tasks & Gamification Engine API
app.use("/api/tasks", tasksRouter);

app.listen(PORT, HOST, () => {
  console.log(
    `🚀 Galaxy RPG Backend running on port ${PORT} (${isProduction ? "production" : "development"})`
  );
  if (!isProduction) {
    console.log(`📡 Local: http://localhost:${PORT}/api/health`);
    console.log(`📡 Network: http://192.168.100.51:${PORT}/api/health`);
    console.log(`🔐 Supabase Auth API: http://localhost:${PORT}/api/auth`);
    console.log(`📋 Authoritative Tasks & EXP API: http://localhost:${PORT}/api/tasks`);
  }
});
