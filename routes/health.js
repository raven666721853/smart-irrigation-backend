// ============================================================
// FILE: backend/routes/health.js
// WHAT: GET /api/health
//       Returns system health: DB connectivity + uptime.
//       No auth required (monitoring tools need open access).
// ============================================================

const express = require("express");
const router  = express.Router();
const db      = require("../db");

router.get("/", (req, res) => {
  db.query("SELECT 1", (err) => {
    if (err) {
      return res.status(503).json({
        status:   "degraded",
        db:       "unreachable",
        uptime:   process.uptime(),
        ts:       new Date().toISOString(),
      });
    }
    res.json({
      status:   "ok",
      db:       "connected",
      uptime:   process.uptime(),
      ts:       new Date().toISOString(),
    });
  });
});

module.exports = router;