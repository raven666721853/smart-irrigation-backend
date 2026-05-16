// ============================================================
// FILE: backend/routes/farms.js  (NEW FILE)
// WHAT: Full CRUD for farms + zones management
//       All routes protected by JWT
// ============================================================

const express     = require("express");
const router      = express.Router();
const db          = require("../db");
const verifyToken = require("../middleware/veriftoken");

// ── GET /api/farms ───────────────────────────────────────────
// Returns all farms with their zone count
router.get("/", verifyToken, (req, res) => {
  db.query(
    `SELECT f.*, 
            COUNT(z.id) as zone_count
     FROM farms f
     LEFT JOIN zones z ON z.farm_id = f.id
     GROUP BY f.id
     ORDER BY f.created_at DESC`,
    (err, result) => {
      if (err) {
        console.error("Farms fetch error:", err);
        return res.status(500).json({ error: "DB error" });
      }
      res.json(result);
    }
  );
});

// ── POST /api/farms ──────────────────────────────────────────
// Create a new farm
router.post("/", verifyToken, (req, res) => {
  const { name, location, lat, lng } = req.body;
  if (!name) return res.status(400).json({ error: "Farm name is required" });

  db.query(
    "INSERT INTO farms (name, location, lat, lng) VALUES (?, ?, ?, ?)",
    [name, location || null, lat || null, lng || null],
    (err, result) => {
      if (err) {
        console.error("Farm create error:", err);
        return res.status(500).json({ error: "DB error" });
      }
      res.json({ success: true, id: result.insertId, name, location, lat, lng });
    }
  );
});

// ── PUT /api/farms/:id ───────────────────────────────────────
// Update a farm
router.put("/:id", verifyToken, (req, res) => {
  const { name, location, lat, lng } = req.body;
  const { id } = req.params;

  db.query(
    "UPDATE farms SET name=?, location=?, lat=?, lng=? WHERE id=?",
    [name, location || null, lat || null, lng || null, id],
    (err) => {
      if (err) {
        console.error("Farm update error:", err);
        return res.status(500).json({ error: "DB error" });
      }
      res.json({ success: true });
    }
  );
});

// ── DELETE /api/farms/:id ────────────────────────────────────
// Delete a farm (zones become unassigned)
router.delete("/:id", verifyToken, (req, res) => {
  const { id } = req.params;

  // Unassign zones first
  db.query("UPDATE zones SET farm_id = NULL WHERE farm_id = ?", [id], (err) => {
    if (err) return res.status(500).json({ error: "DB error" });

    db.query("DELETE FROM farms WHERE id = ?", [id], (err2) => {
      if (err2) return res.status(500).json({ error: "DB error" });
      res.json({ success: true });
    });
  });
});

// ── GET /api/farms/:id/zones ─────────────────────────────────
// Get all zones for a specific farm
router.get("/:id/zones", verifyToken, (req, res) => {
  db.query(
    "SELECT zone, name, moisture, temperature, last_seen, farm_id FROM zones WHERE farm_id = ? ORDER BY zone ASC",
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(result);
    }
  );
});

// ── POST /api/farms/:id/zones ────────────────────────────────
// Add a new zone to a farm
router.post("/:id/zones", verifyToken, (req, res) => {
  const { zone, name } = req.body;
  const farm_id = req.params.id;

  if (!zone) return res.status(400).json({ error: "Zone number is required" });

  // Check if zone number already exists
  db.query("SELECT id FROM zones WHERE zone = ?", [zone], (err, existing) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (existing.length > 0) {
      return res.status(409).json({ error: `Zone ${zone} already exists` });
    }

    db.query(
      "INSERT INTO zones (zone, name, moisture, temperature, farm_id, last_seen) VALUES (?, ?, 50, 25, ?, NOW())",
      [zone, name || `Zone ${zone}`, farm_id],
      (err2, result) => {
        if (err2) {
          console.error("Zone create error:", err2);
          return res.status(500).json({ error: "DB error" });
        }
        res.json({ success: true, id: result.insertId, zone, name: name || `Zone ${zone}`, farm_id });
      }
    );
  });
});

// ── DELETE /api/farms/:farmId/zones/:zoneNum ─────────────────
// Remove a zone from a farm
router.delete("/:farmId/zones/:zoneNum", verifyToken, (req, res) => {
  const { farmId, zoneNum } = req.params;

  db.query(
    "DELETE FROM zones WHERE zone = ? AND farm_id = ?",
    [zoneNum, farmId],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ success: true });
    }
  );
});

module.exports = router;