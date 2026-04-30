const mysql = require("mysql2");

const db = mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "admin",
  database: "irrigation_db",
  port: 3300
});

db.connect((err) => {
  if (err) {
    console.error("FULL ERROR:", err);
  } else {
    console.log("MySQL Connected");
  }
});

module.exports = db;