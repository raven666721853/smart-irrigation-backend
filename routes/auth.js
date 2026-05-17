const express = require("express");
const router = express.Router();

const db = require("../db");

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");


// ================= REGISTER =================
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashedPassword],
      (err) => {

        if (err) {
          console.error(err);

          return res.status(500).json({
            message: "User exists or DB error"
          });
        }

        res.json({
          message: "User created"
        });
      }
    );

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server error"
    });
  }
});


// ================= LOGIN =================
router.post("/login", (req, res) => {

  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, results) => {

      if (err) {
        console.error(err);

        return res.status(500).json({
          message: "DB error"
        });
      }

      if (results.length === 0) {
        return res.status(401).json({
          message: "User not found"
        });
      }

      const user = results[0];

      const validPassword = await bcrypt.compare(
        password,
        user.password
      );

      if (!validPassword) {
        return res.status(401).json({
          message: "Wrong password"
        });
      }

      const token = jwt.sign(
        {
          id: user.id,
          role: user.role
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "7d"
        }
      );

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });

    }
  );
});

module.exports = router;