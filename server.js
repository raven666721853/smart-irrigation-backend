require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./db");

// Start cron jobs
require("./jobs/offlineDetector");

const verifyToken = require("./middleware/verifyToken");
const verifyESP32 = require("./middleware/verifyESP32");

const app = express();

// ─── CORS ─────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,        // e.g. https://your-app.vercel.app
  "http://localhost:5173",          // Vite dev server
  "http://localhost:3000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────
app.use("/api/auth",   require("./routes/auth"));
app.use("/api/health", require("./routes/health"));
app.use("/api/farms",  verifyToken, require("./routes/farms"));
app.use("/api/admin",  verifyToken, require("./routes/admin"));

// ─── 404 ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ─── Global error handler (required for Express 5 async errors) ─
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ❌ Unhandled error:`, err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// ─── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
