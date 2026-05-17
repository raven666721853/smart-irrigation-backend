// ============================================================
// FILE: backend/routes/admin.js  (NEW FILE)
// Mount in server.js with:
//   app.use("/api/admin", verifyToken, require("./routes/admin"));
// ============================================================
const express = require("express");
const router  = express.Router();
const db      = require("../db");
const bcrypt  = require("bcrypt");

// ── GET /api/admin/users ─────────────────────────────────────
// List all users (id, name, email, created_at — no password)
router.get("/users", (req, res) => {
  db.query(
    "SELECT id, name, email, created_at FROM users ORDER BY created_at DESC",
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows);
    }
  );
});

// ── DELETE /api/admin/users/:id ──────────────────────────────
// Delete a user (cannot delete yourself)
router.delete("/users/:id", (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: "Cannot delete yourself" });
  }
  db.query("DELETE FROM users WHERE id = ?", [targetId], (err, result) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "User not found" });
    res.json({ success: true, message: "User deleted" });
  });
});

// ── PUT /api/admin/users/:id/password ────────────────────────
// Reset a user's password
router.put("/users/:id/password", async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  const hashed = await bcrypt.hash(newPassword, 10);
  db.query(
    "UPDATE users SET password = ? WHERE id = ?",
    [hashed, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (result.affectedRows === 0)
        return res.status(404).json({ error: "User not found" });
      res.json({ success: true, message: "Password updated" });
    }
  );
});

// ── GET /api/admin/stats ─────────────────────────────────────
// System-wide statistics for admin dashboard
router.get("/stats", (req, res) => {
  const queries = {
    totalUsers:      "SELECT COUNT(*) AS count FROM users",
    totalFarms:      "SELECT COUNT(*) AS count FROM farms",
    totalZones:      "SELECT COUNT(*) AS count FROM zones",
    totalIrrigations:"SELECT COUNT(*) AS count FROM irrigation_logs",
    smartOns:        "SELECT COUNT(*) AS count FROM irrigation_logs WHERE status = 'SMART ON'",
    manualOns:       "SELECT COUNT(*) AS count FROM irrigation_logs WHERE status = 'MANUAL ON'",
    todayLogs:       "SELECT COUNT(*) AS count FROM irrigation_logs WHERE DATE(created_at) = CURDATE()",
    recentLogs:      `SELECT il.zone, il.status, il.decision_reason, il.created_at, f.name AS farm_name
                      FROM irrigation_logs il
                      LEFT JOIN zones z ON z.zone = il.zone
                      LEFT JOIN farms f ON f.id = z.farm_id
                      ORDER BY il.created_at DESC LIMIT 10`,
    waterToday:      "SELECT COALESCE(SUM(liters_used),0) AS total FROM water_usage WHERE date = CURDATE()",
    waterWeek:       "SELECT COALESCE(SUM(liters_used),0) AS total FROM water_usage WHERE date >= DATE_SUB(CURDATE(),INTERVAL 7 DAY)",
  };

  const results = {};
  const keys = Object.keys(queries);
  let done = 0;

  keys.forEach((key) => {
    db.query(queries[key], (err, rows) => {
      if (!err) {
        results[key] = key === "recentLogs" ? rows : rows[0];
      }
      if (++done === keys.length) {
        res.json(results);
      }
    });
  });
});

// ── GET /api/admin/logs ──────────────────────────────────────
// Full irrigation log with user/farm context
router.get("/logs", (req, res) => {
  db.query(
    `SELECT il.id, il.zone, il.status, il.decision_score, il.decision_reason,
            il.created_at, f.name AS farm_name
     FROM irrigation_logs il
     LEFT JOIN zones z ON z.zone = il.zone
     LEFT JOIN farms f ON f.id = z.farm_id
     ORDER BY il.created_at DESC
     LIMIT 200`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows);
    }
  );
});

module.exports = router;