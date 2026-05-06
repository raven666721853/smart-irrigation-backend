const cron = require("node-cron");
const db = require("../db");

cron.schedule("* * * * *", () => {

  db.query(
    `
    SELECT zone, last_seen
    FROM zones
    WHERE last_seen IS NULL
       OR last_seen < NOW() - INTERVAL 2 MINUTE
    `,
    (err, result) => {

      if (err) {
        console.log("Offline detector error:", err);
        return;
      }

      result.forEach(zone => {
        console.log(
          `⚠️ Zone ${zone.zone} OFFLINE`
        );
      });

    }
  );

});