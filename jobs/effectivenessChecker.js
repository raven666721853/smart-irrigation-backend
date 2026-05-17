// ============================================================
// FILE: backend/jobs/effectivenessChecker.js  (NEW FILE)
// Checks if irrigation actually improved soil moisture.
// Runs every 30 minutes. Logs a warning if moisture didn't rise.
// ============================================================
const db = require("../db");

function checkEffectiveness() {
  // Find irrigation_logs from 20-40 min ago that were SMART ON or MANUAL ON
  db.query(
    `SELECT id, zone, status, created_at
     FROM irrigation_logs
     WHERE status IN ('SMART ON', 'MANUAL ON')
       AND created_at BETWEEN DATE_SUB(NOW(), INTERVAL 40 MINUTE)
                          AND DATE_SUB(NOW(), INTERVAL 20 MINUTE)`,
    (err, logs) => {
      if (err || !logs.length) return;

      logs.forEach((log) => {
        // Check current moisture for that zone
        db.query(
          "SELECT moisture FROM zones WHERE zone = ? LIMIT 1",
          [log.zone],
          (err2, zones) => {
            if (err2 || !zones.length) return;
            const currentMoisture = zones[0].moisture;

            if (currentMoisture < 35) {
              // Irrigation may not have been effective — log it
              console.log(
                `⚠️  Effectiveness check: Zone ${log.zone} irrigated at ${log.created_at} but moisture is still ${currentMoisture}%`
              );

              // Insert a notification if the table exists
              db.query(
                `INSERT INTO notifications (zone, type, message)
                 VALUES (?, 'WARNING', ?)`,
                [
                  log.zone,
                  `Irrigation at ${log.created_at.toISOString().slice(0, 16)} may not have been effective (moisture still ${currentMoisture}%)`,
                ],
                () => {} // silent — notifications table may not exist
              );
            }
          }
        );
      });
    }
  );
}

// Run immediately and then every 30 minutes
checkEffectiveness();
setInterval(checkEffectiveness, 30 * 60 * 1000);

module.exports = { checkEffectiveness };