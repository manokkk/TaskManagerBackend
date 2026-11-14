import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const FALLBACK_DEV_SECRET = "galaxy-quest-rpg-super-secret-jwt-key-2026";

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET environment variable must be set in production."
      );
    }
    return FALLBACK_DEV_SECRET;
  }
  return secret;
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization token is required." });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: "Authorization token is required." });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId?: string };
    if (!decoded?.userId) {
      res.status(401).json({ error: "Invalid session token." });
      return;
    }
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: "Expired or invalid session token." });
  }
}
