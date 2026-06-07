require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const db        = require("./db");
const axios     = require("axios");
const rateLimit = require("express-rate-limit");

// ── Start jobs ───────────────────────────────────────────────
require("./jobs/offlineDetector");

// ── Middleware ───────────────────────────────────────────────
const verifyToken = require("./middleware/verifyToken");
const verifyESP32 = require("./middleware/verifyESP32");

const app = express();
app.set("trust proxy", 1);

// ── CORS ─────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: true,
}));
app.options("/{*path}", cors());
app.use(express.json());

// ── Rate limiter ─────────────────────────────────────────────
app.use("/api", rateLimit({ windowMs: 60 * 1000, max: 100, message: "Too many requests" }));

// ── Active irrigation tracker ────────────────────────────────
const activeIrrigation = {};
const FLOW_RATE = 2;

// ============================================================
// ROUTES
// ============================================================
console.log("🚀 Server starting...");

app.get("/", (req, res) => res.send("Backend is working ✅"));

app.use("/api/auth",       require("./routes/auth"));
app.use("/api/health",     require("./routes/health"));
app.use("/api/farms",      verifyToken, require("./routes/farms"));
app.use("/api/admin",      verifyToken, require("./routes/admin"));
app.use("/api/export/csv", verifyToken, require("./routes/export"));

// ── GET /api/zones ───────────────────────────────────────────
app.get("/api/zones", verifyToken, (req, res) => {
  const farmId = req.query.farm;
  const query = farmId
    ? "SELECT zone, name, moisture, temperature, last_seen, farm_id FROM zones WHERE farm_id = ? ORDER BY zone ASC"
    : "SELECT zone, name, moisture, temperature, last_seen, farm_id FROM zones ORDER BY zone ASC";
  const params = farmId ? [farmId] : [];
  db.query(query, params, (err, result) => {
    if (err) { console.error("GET /zones error:", err.message); return res.status(500).json({ error: "DB error" }); }
    res.json(result);
  });
});

// ── POST /api/sensor ─────────────────────────────────────────
app.post("/api/sensor", verifyESP32, (req, res) => {
  const { zone, temperature, moisture } = req.body;
  if (!zone) return res.status(400).json({ error: "Missing zone" });
  db.query(
    "UPDATE zones SET temperature=?, moisture=?, last_seen=NOW() WHERE zone=?",
    [temperature ?? null, moisture ?? null, zone],
    (err) => {
      if (err) { console.error("POST /sensor error:", err.message); return res.status(500).json({ error: "DB error" }); }
      console.log(`📡 Sensor update zone ${zone}: moisture=${moisture} temp=${temperature}`);
      res.json({ message: "Updated successfully" });
    }
  );
});

// ── GET /api/weather ─────────────────────────────────────────
app.get("/api/weather", async (req, res) => {
  const lat = req.query.lat || 34.74;
  const lon = req.query.lon || 10.76;
  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API_KEY}&units=metric`
    );
    res.json({
      city:      response.data.name,
      temp:      response.data.main.temp,
      humidity:  response.data.main.humidity,
      rain:      response.data.weather[0].main.toLowerCase().includes("rain"),
      condition: response.data.weather[0].main,
    });
  } catch (err) {
    console.error("Weather error:", err.message);
    res.status(500).json({ error: "Weather unavailable" });
  }
});

// ── GET /api/forecast ────────────────────────────────────────
app.get("/api/forecast", async (req, res) => {
  const lat = req.query.lat || 34.74;
  const lon = req.query.lon || 10.76;
  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API_KEY}&units=metric`
    );
    res.json(response.data.list.map((f) => ({
      time:      f.dt,
      temp:      f.main.temp,
      condition: f.weather[0].main,
    })));
  } catch (err) {
    console.error("Forecast error:", err.message);
    res.status(500).json({ error: "Forecast unavailable" });
  }
});

// ── POST /api/irrigation ─────────────────────────────────────
app.post("/api/irrigation", verifyToken, (req, res) => {
  const { zone, action, status } = req.body;
  if (!zone) return res.status(400).json({ error: "Missing zone" });

  let finalStatus;
  if (action) {
    finalStatus = action.toLowerCase() === "on" ? "MANUAL ON" : "MANUAL OFF";
  } else if (status) {
    finalStatus = status;
  } else {
    return res.status(400).json({ error: "Missing action or status" });
  }

  db.query(
    "INSERT INTO irrigation_logs (zone, status, reason, decision_score) VALUES (?, ?, ?, ?)",
    [zone, finalStatus, "MANUAL", null],
    (err) => {
      if (err) { console.error("POST /irrigation error:", err.message); return res.status(500).json({ error: "DB error" }); }
      console.log(`💧 Manual irrigation zone ${zone}: ${finalStatus}`);
      res.json({ success: true });
    }
  );
});

// ── GET /api/history ─────────────────────────────────────────
app.get("/api/history", verifyToken, (req, res) => {
  const filter = req.query.filter;
  let query = "SELECT * FROM irrigation_logs";
  if (filter === "auto")   query += " WHERE status LIKE 'SMART%'";
  if (filter === "manual") query += " WHERE status LIKE 'MANUAL%'";
  query += " ORDER BY created_at DESC LIMIT 200";

  db.query(query, (err, result) => {
    if (err) { console.error("GET /history error:", err.message); return res.status(500).json({ error: "DB error" }); }
    res.json(result);
  });
});

// ── GET /api/alerts ──────────────────────────────────────────
app.get("/api/alerts", verifyToken, (req, res) => {
  db.query(
    `SELECT zone, moisture, 'DRY' as type FROM zones WHERE moisture < 40
     UNION
     SELECT zone, 0 as moisture, 'SMART' as type FROM irrigation_logs
     WHERE status = 'SMART ON' AND created_at >= NOW() - INTERVAL 1 MINUTE`,
    (err, result) => {
      if (err) { console.error("GET /alerts error:", err.message); return res.status(500).json({ error: "DB error" }); }
      res.json(result);
    }
  );
});

// ── GET /api/command ─────────────────────────────────────────
app.get("/api/command", verifyESP32, (req, res) => {
  const zone = req.query.zone || 1;
  db.query("SELECT moisture, temperature FROM zones WHERE zone=?", [zone], (err, result) => {
    if (err || result.length === 0) return res.json({ irrigate: false });

    const { moisture, temperature } = result[0];

    db.query(
      "SELECT status FROM irrigation_logs WHERE zone=? ORDER BY id DESC LIMIT 1",
      [zone],
      async (err2, last) => {
        let irrigate = false;
        let reason   = "AUTO";
        let score    = null;

        if (last && last.length) {
          const lastStatus = last[0].status;
          if (lastStatus === "MANUAL ON") {
            irrigate = true;
            reason   = "MANUAL";
          } else if (lastStatus === "MANUAL OFF") {
            irrigate = false;
            reason   = "MANUAL";
          } else {
            try {
              const weather  = await getWeather();
              const forecast = await getForecast();
              const decision = shouldIrrigate({ moisture, temperature }, weather, forecast);
              irrigate = decision.irrigate;
              score    = decision.score;
              reason   = `Score: ${decision.score} | Moisture: ${moisture} | Temp: ${temperature}`;
              console.log(`🧠 SMART Decision zone ${zone}: irrigate=${irrigate} score=${score}`);
              db.query(
                "INSERT INTO irrigation_logs (zone, status, reason, decision_score) VALUES (?, ?, ?, ?)",
                [zone, irrigate ? "SMART ON" : "SMART OFF", reason, score],
                (e) => { if (e) console.error("Log insert error:", e.message); }
              );
            } catch (e) {
              console.error("Smart decision error:", e.message);
              irrigate = moisture < 40 || temperature > 32;
            }
          }
        } else {
          irrigate = moisture < 40 || temperature > 32;
        }

        const key = `zone_${zone}`;
        if (irrigate) {
          if (!activeIrrigation[key]) activeIrrigation[key] = { startTime: Date.now() };
        } else {
          if (activeIrrigation[key]) {
            const duration = Math.round((Date.now() - activeIrrigation[key].startTime) / 1000);
            db.query(
              "UPDATE irrigation_logs SET duration_seconds=? WHERE zone=? ORDER BY id DESC LIMIT 1",
              [duration, zone],
              (e) => { if (e) console.error("Duration update error:", e.message); }
            );
            console.log(`💧 Zone ${zone} irrigated for ${duration}s`);
            delete activeIrrigation[key];
          }
        }

        res.json({ irrigate });
      }
    );
  });
});

// ── GET /api/stream (SSE) ────────────────────────────────────
app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  const send = () => {
    db.query("SELECT zone, moisture, temperature, last_seen FROM zones", (err, zones) => {
      if (!err) res.write(`data: ${JSON.stringify(zones)}\n\n`);
    });
  };
  send();
  const interval = setInterval(send, 3000);
  req.on("close", () => clearInterval(interval));
});

// ── GET /api/water-stats ─────────────────────────────────────
app.get("/api/water-stats", verifyToken, (req, res) => {
  const todayQuery = `SELECT SUM(duration_seconds) as total FROM irrigation_logs WHERE DATE(created_at) = CURDATE()`;
  const weekQuery  = `SELECT DATE(created_at) as day, SUM(duration_seconds) as total FROM irrigation_logs WHERE created_at >= NOW() - INTERVAL 7 DAY GROUP BY day ORDER BY day ASC`;

  db.query(todayQuery, (err1, todayRes) => {
    if (err1) { console.error("Water stats error:", err1.message); return res.status(500).json({ error: "DB error" }); }
    db.query(weekQuery, (err2, weekRes) => {
      if (err2) { console.error("Water stats week error:", err2.message); return res.status(500).json({ error: "DB error" }); }
      res.json({
        today:  ((todayRes[0].total || 0) / 60) * FLOW_RATE,
        weekly: weekRes.map((r) => ({ day: r.day, liters: ((r.total || 0) / 60) * FLOW_RATE })),
      });
    });
  });
});

// ── 404 ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ❌ Unhandled error:`, err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || "Internal server error" });
});

// ============================================================
// DECISION ENGINE
// ============================================================
function shouldIrrigate(zone, weather = {}, forecast = []) {
  let score = 0;
  if (zone.moisture < 60)    score += Math.max(0, (60 - zone.moisture) * 0.67);
  if (zone.temperature > 32) score += (zone.temperature - 32) * 2;
  if (weather.rain)          score -= 20;
  const rainComing = forecast.slice(0, 3).some((f) => f.condition?.toLowerCase().includes("rain"));
  if (rainComing) score -= 25;
  const hour = new Date().getHours();
  if (hour >= 5  && hour <= 8)  score += 10;
  if (hour >= 11 && hour <= 15) score -= 15;
  return { irrigate: score > 40, score: Math.round(score) };
}

// ============================================================
// WEATHER HELPERS
// ============================================================
async function getWeather(lat = 34.74, lon = 10.76) {
  try {
    const res = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API_KEY}&units=metric`
    );
    return {
      temp:     res.data?.main?.temp     ?? 0,
      humidity: res.data?.main?.humidity ?? 0,
      rain:     res.data?.weather?.[0]?.main?.toLowerCase().includes("rain") || false,
    };
  } catch (err) {
    console.error("getWeather error:", err.message);
    return { temp: 0, humidity: 0, rain: false };
  }
}

async function getForecast(lat = 34.74, lon = 10.76) {
  try {
    const res = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API_KEY}&units=metric`
    );
    return res.data.list || [];
  } catch (err) {
    console.error("getForecast error:", err.message);
    return [];
  }
}

// ============================================================
// AUTO IRRIGATION (every 5 seconds)
// ============================================================
async function autoIrrigation() {
  try {
    const weather  = await getWeather();
    const forecast = await getForecast();

    db.query("SELECT zone, moisture, temperature FROM zones", (err, zones) => {
      if (err) { console.error("autoIrrigation query error:", err.message); return; }
      zones.forEach((zone) => {
        let score = 0;
        if (zone.moisture < 35)      score += 2;
        else if (zone.moisture < 45) score += 1;
        if (zone.temperature > 32)   score += 1;
        if ((weather?.humidity ?? 100) < 50) score += 1;
        if (weather?.rain)           score -= 3;

        if (score >= 2) {
          db.query(
            "SELECT * FROM irrigation_logs WHERE zone=? ORDER BY id DESC LIMIT 1",
            [zone.zone],
            (err2, last) => {
              if (err2) return;
              if (last.length) {
                const diffMinutes = (Date.now() - new Date(last[0].created_at).getTime()) / 1000 / 60;
                if (diffMinutes < 0.2) { console.log(`⛔ Zone ${zone.zone} cooldown`); return; }
              }
              const reason = `Moisture: ${zone.moisture}% | Temp: ${zone.temperature}°C | Score: ${score}`;
              console.log(`✅ SMART irrigation → Zone ${zone.zone}`);
              db.query(
                "INSERT INTO irrigation_logs (zone, status, reason, decision_score) VALUES (?, ?, ?, ?)",
                [zone.zone, "SMART ON", reason, score],
                (e) => { if (e) console.error("Auto log error:", e.message); }
              );
              db.query(
                "UPDATE zones SET moisture = LEAST(moisture + 10, 100) WHERE zone = ?",
                [zone.zone],
                (e) => { if (e) console.error("Moisture update error:", e.message); }
              );
            }
          );
        }
      });
    });
  } catch (err) {
    console.error("autoIrrigation error:", err.message);
  }
}

setInterval(autoIrrigation, 5000);

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
