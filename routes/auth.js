const express = require("express");
const router  = express.Router();
const db      = require("../db");
const jwt     = require("jsonwebtoken");
const bcrypt  = require("bcryptjs");

// ── POST /api/auth/register ──────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name.trim(), email.toLowerCase().trim(), hashedPassword],
      (err) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "Email already registered" });
          }
          console.error("Register DB error:", err.message);
          return res.status(500).json({ message: "Server error" });
        }
        res.status(201).json({ message: "User created" });
      }
    );
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    db.query(
      "SELECT * FROM users WHERE email = ?",
      [email.toLowerCase().trim()],
      async (err, results) => {
        if (err) {
          console.error("Login DB error:", err.message);
          return res.status(500).json({ message: "Server error" });
        }

        // Always run bcrypt.compare even if user not found to prevent timing attacks
        const dummyHash = "$2b$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuuabcdefghijkl";
        const userHash  = results.length > 0 ? results[0].password : dummyHash;
        const valid     = await bcrypt.compare(password, userHash);

        if (results.length === 0 || !valid) {
          return res.status(401).json({ message: "Invalid email or password" });
        }

        const user  = results[0];
        const token = jwt.sign(
          { id: user.id, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );

        res.json({
          token,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
      }
    );
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
