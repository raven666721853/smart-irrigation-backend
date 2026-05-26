const mysql = require("mysql2");

const db = mysql.createPool({
  host:               process.env.DB_HOST,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  port:               parseInt(process.env.DB_PORT || "3306"),
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
});

// Test connection on startup
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ DB connection failed:", err.message);
  } else {
    console.log("✅ Connected to Railway DB");
    connection.release();
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  db.end((err) => {
    if (err) console.error("Error closing DB pool:", err.message);
    else console.log("DB pool closed.");
  });
});

module.exports = db;
