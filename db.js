const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "switchyard.proxy.rlwy.net",
  user: "root",
  password: "sWsDkwkfajIRAGnAzzhSnNXHaFvyDjHC",
  database: "railway",
  port: 22863
});

db.connect((err) => {
  if (err) {
    console.log("❌ DB ERROR:", err);
  } else {
    console.log("✅ Connected to Railway DB");
  }
});

module.exports = db;