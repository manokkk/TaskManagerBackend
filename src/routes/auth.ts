import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "galaxy-quest-rpg-super-secret-jwt-key-2026";

// POST /api/auth/register — Register new Commander
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, username } = req.body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Please provide a valid cosmic email address." });
      return;
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "Password cipher must be at least 6 characters." });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername =
      typeof username === "string" && username.trim()
        ? username.trim()
        : cleanEmail.split("@")[0];

    // Check if user already exists in Supabase
    const existing = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existing) {
      res.status(409).json({ error: "A Commander with this email already exists." });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user record directly in Supabase
    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        password: hashedPassword,
        username: cleanUsername,
        totalExp: 0,
      },
      select: {
        id: true,
        email: true,
        username: true,
        totalExp: true,
        createdAt: true,
      },
    });

    // Generate JWT token (valid for 7 days)
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Commander successfully registered in the Supabase galaxy registry!",
      user,
      token,
    });
  } catch (error) {
    console.error("Error registering user in Supabase:", error);
    res.status(500).json({ error: "Database registration failed. Please try again." });
  }
});

// POST /api/auth/login — Authenticate Commander
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    // Query user directly from Supabase
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user) {
      res.status(401).json({ error: "Invalid credentials. Commander not found." });
      return;
    }

    // Verify password cipher
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: "Invalid password cipher." });
      return;
    }

    // Generate JWT token (valid for 7 days)
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Command deck access granted!",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        totalExp: user.totalExp,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (error) {
    console.error("Error logging in via Supabase:", error);
    res.status(500).json({ error: "Database login failed. Please try again." });
  }
});

// GET /api/auth/me — Retrieve current Commander profile from Supabase
router.get("/me", async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid authorization token." });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        username: true,
        totalExp: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "Commander profile not found in Supabase." });
      return;
    }

    res.json({ user });
  } catch {
    res.status(401).json({ error: "Expired or invalid session token." });
  }
});

export default router;

