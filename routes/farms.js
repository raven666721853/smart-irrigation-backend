// FILE: backend/routes/farms.js
const express = require("express");
const router  = express.Router();
const db      = require("../db");
const verifyToken = require("../middleware/veriftoken");

// Apply JWT to all farm routes
router.use(verifyToken);

// ── GET /api/farms ─────────────────────────────────────────────
// Returns all farms with zone count
router.get("/", (req, res) => {
  db.query(
    `SELECT f.*, COUNT(z.zone) AS zone_count
     FROM farms f
     LEFT JOIN zones z ON z.farm_id = f.id
     GROUP BY f.id
     ORDER BY f.created_at DESC`,
    (err, results) => {
      if (err) {
        console.error("GET /farms error:", err);
        return res.status(500).json({ error: "DB error", detail: err.message });
      }
      res.json(results);
    }
  );
});

// ── POST /api/farms ────────────────────────────────────────────
// Create a new farm
router.post("/", (req, res) => {
  const { name, location, lat, lng } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Farm name is required" });
  }
  db.query(
    "INSERT INTO farms (name, location, lat, lng) VALUES (?, ?, ?, ?)",
    [name.trim(), location || null, lat || null, lng || null],
    (err, result) => {
      if (err) {
        console.error("POST /farms error:", err);
        return res.status(500).json({ error: "DB error", detail: err.message });
      }
      res.status(201).json({ id: result.insertId, name, location, lat, lng });
    }
  );
});

// ── PUT /api/farms/:id ─────────────────────────────────────────
// Update a farm
router.put("/:id", (req, res) => {
  const { name, location, lat, lng } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Farm name is required" });
  }
  db.query(
    "UPDATE farms SET name=?, location=?, lat=?, lng=? WHERE id=?",
    [name.trim(), location || null, lat || null, lng || null, req.params.id],
    (err) => {
      if (err) {
        console.error("PUT /farms error:", err);
        return res.status(500).json({ error: "DB error", detail: err.message });
      }
      res.json({ success: true });
    }
  );
});

// ── DELETE /api/farms/:id ──────────────────────────────────────
// Delete a farm (unassigns its zones)
router.delete("/:id", (req, res) => {
  db.query("UPDATE zones SET farm_id = NULL WHERE farm_id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "DB error" });
    db.query("DELETE FROM farms WHERE id = ?", [req.params.id], (err2) => {
      if (err2) return res.status(500).json({ error: "DB error" });
      res.json({ success: true });
    });
  });
});

// ── POST /api/farms/:id/zones ──────────────────────────────────
// Assign a zone to a farm
router.post("/:id/zones", (req, res) => {
  const { zone, name } = req.body;
  if (!zone) return res.status(400).json({ error: "Zone number required" });

  // Check if zone row exists
  db.query("SELECT zone FROM zones WHERE zone = ?", [zone], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });

    if (rows.length === 0) {
      // Zone doesn't exist yet — create it
      db.query(
        "INSERT INTO zones (zone, name, moisture, temperature, farm_id) VALUES (?, ?, 0, 0, ?)",
        [zone, name || `Zone ${zone}`, req.params.id],
        (err2) => {
          if (err2) {
            if (err2.code === "ER_DUP_ENTRY") {
              return res.status(409).json({ error: `Zone ${zone} already exists` });
            }
            return res.status(500).json({ error: "DB error", detail: err2.message });
          }
          res.status(201).json({ success: true });
        }
      );
    } else {
      // Zone exists — just assign it to this farm
      db.query(
        "UPDATE zones SET farm_id = ?, name = COALESCE(?, name) WHERE zone = ?",
        [req.params.id, name || null, zone],
        (err3) => {
          if (err3) return res.status(500).json({ error: "DB error" });
          res.json({ success: true });
        }
      );
    }
  });
});

// ── DELETE /api/farms/:id/zones/:zone ─────────────────────────
// Unassign a zone from a farm
router.delete("/:id/zones/:zone", (req, res) => {
  db.query(
    "UPDATE zones SET farm_id = NULL WHERE zone = ? AND farm_id = ?",
    [req.params.zone, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ success: true });
    }
  );
});

module.exports = router;