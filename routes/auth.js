const express = require("express");
const router = express.Router();
const db = require("../db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");


// 📝 REGISTER
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  db.query(
    "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
    [name, email, hashedPassword],
    (err) => {
      if (err) return res.status(500).send("User exists or DB error");
      res.json({ message: "User created" });
    }
  );
});


// 🔐 LOGIN
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, result) => {
      if (err) return res.status(500).send("DB error");

      if (result.length === 0) {
        return res.status(401).send("User not found");
      }

      const user = result[0];

      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.status(401).send("Wrong password");
      }

      const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email },
        "SECRET_KEY"
      );

      res.json({ token, user });
    }
  );
});

module.exports = router;