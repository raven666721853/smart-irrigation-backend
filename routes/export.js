// ============================================================
// FILE: backend/routes/export.js
// WHAT: GET /api/export/csv
//       Streams irrigation_logs as a downloadable CSV file.
//       Protected by JWT (same as /api/history).
// ============================================================

const express  = require("express");
const router   = express.Router();
const db       = require("../db");
const verifyToken = require("../middleware/veriftoken");

router.get("/", verifyToken, (req, res) => {
  db.query(
    "SELECT id, zone, status, reason, duration_seconds, created_at FROM irrigation_logs ORDER BY created_at DESC",
    (err, rows) => {
      if (err) {
        console.error("CSV export error:", err);
        return res.status(500).json({ error: "DB error" });
      }

      // Build CSV string
      const header = ["id", "zone", "status", "reason", "duration_seconds", "created_at"];
      const lines  = rows.map((r) =>
        [
          r.id,
          r.zone,
          `"${(r.status      || "").replace(/"/g, '""')}"`,
          `"${(r.reason      || "").replace(/"/g, '""')}"`,
          r.duration_seconds || 0,
          r.created_at ? new Date(r.created_at).toISOString() : "",
        ].join(",")
      );

      const csv = [header.join(","), ...lines].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="irrigation_history_${Date.now()}.csv"`
      );
      res.send(csv);
    }
  );
});

module.exports = router;