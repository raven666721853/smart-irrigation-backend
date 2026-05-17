// ============================================================
// FILE: backend/jobs/dataRetention.js  (NEW FILE)
// Cleans up old irrigation_logs (keeps last 90 days).
// Runs once per day at startup + every 24 hours.
// ============================================================
const db = require("../db");

function runRetention() {
  // Delete irrigation logs older than 90 days
  db.query(
    "DELETE FROM irrigation_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)",
    (err, result) => {
      if (err) {
        console.error("Data retention error (irrigation_logs):", err.message);
        return;
      }
      if (result.affectedRows > 0) {
        console.log(`🗑️  Data retention: removed ${result.affectedRows} old irrigation log(s)`);
      }
    }
  );

  // Delete water_usage older than 365 days
  db.query(
    "DELETE FROM water_usage WHERE date < DATE_SUB(CURDATE(), INTERVAL 365 DAY)",
    (err, result) => {
      if (err) return;
      if (result && result.affectedRows > 0) {
        console.log(`🗑️  Data retention: removed ${result.affectedRows} old water_usage record(s)`);
      }
    }
  );

  // Delete read notifications older than 30 days
  db.query(
    "DELETE FROM notifications WHERE `read` = 1 AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)",
    () => {} // silent — notifications table may not exist yet
  );
}

// Run at startup and every 24 hours
runRetention();
setInterval(runRetention, 24 * 60 * 60 * 1000);

module.exports = { runRetention };