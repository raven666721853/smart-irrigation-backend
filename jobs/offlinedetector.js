const cron = require("node-cron");
const db   = require("../db");

cron.schedule("* * * * *", () => {
  db.query(
    `SELECT zone, last_seen
     FROM zones
     WHERE last_seen IS NULL
        OR last_seen < NOW() - INTERVAL 2 MINUTE`,
    (err, result) => {
      if (err) {
        console.error("❌ Offline detector error:", err.message);
        return;
      }

      if (result.length === 0) return;

      result.forEach((zone) => {
        const lastSeen = zone.last_seen
          ? new Date(zone.last_seen).toISOString()
          : "never";
        console.warn(`⚠️  Zone ${zone.zone} OFFLINE — last seen: ${lastSeen}`);
      });
    }
  );
});

console.log("🕐 Offline detector started (runs every minute)");
