// ============================================================
// FILE: backend/server.js  (FULL REPLACEMENT)
// CHANGES vs original:
//   ✅ verifyESP32 applied to POST /api/sensor and GET /api/command
//   ✅ /api/zones now returns last_seen
//   ✅ decision_score saved in irrigation_logs
//   ✅ GET /api/export/csv mounted
//   ✅ GET /api/health mounted
//   ✅ POST /api/irrigation now has verifyToken
//   ✅ rate limiter kept (100 req/min)
//   ✅ SSE /api/stream kept
//   ✅ GET /api/water-stats kept
//   ✅ autoIrrigation cron kept (5s)
// ============================================================

require("dotenv").config();
require("./jobs/offlinedetector");

const verifyToken  = require("./middleware/veriftoken");
const verifyESP32  = require("./middleware/verifyESP32");

const express  = require("express");
const cors     = require("cors");
const db       = require("./db");
const axios    = require("axios");
const rateLimit = require("express-rate-limit");

const app = express();

// ── Rate limiter ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: "Too many requests",
});
app.use("/api", limiter);

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Active irrigation tracker ────────────────────────────────
const activeIrrigation = {};
const FLOW_RATE = 2; // liters per minute

// ============================================================
// ROUTES
// ============================================================
console.log("🔥 NEW VERSION DEPLOYED");

// Root health check
app.get("/", (req, res) => res.send("Backend is working"));

// Auth
app.use("/api/auth", require("./routes/auth"));

// Health & Export (new)
app.use("/api/health",     require("./routes/health"));
app.use("/api/farms", require("./routes/farms"));
app.use("/api/export/csv", require("./routes/export"));

// ── GET /api/zones ──────────────────────────────────────────
// NOW returns last_seen so the frontend can show offline badge
app.get("/api/zones", verifyToken, (req, res) => {
  // Optional: filter by farm if ?farm=id is passed
  const farmId = req.query.farm;
  const query = farmId
    ? "SELECT zone, name, moisture, temperature, last_seen, farm_id FROM zones WHERE farm_id = ? ORDER BY zone ASC"
    : "SELECT zone, name, moisture, temperature, last_seen, farm_id FROM zones ORDER BY zone ASC";
  const params = farmId ? [farmId] : [];
 
  db.query(query, params, (err, result) => {
    if (err) return res.status(500).send("DB error");
    res.json(result);
  });
});

// ── POST /api/sensor ─────────────────────────────────────────
// Protected by ESP32 API key (was unprotected before)
app.post("/api/sensor", verifyESP32, (req, res) => {
  const { zone, temperature, moisture } = req.body;
  if (!zone) return res.status(400).send("Missing zone");

  db.query(
    "UPDATE zones SET temperature=?, moisture=?, last_seen=NOW() WHERE zone=?",
    [temperature, moisture, zone],
    (err) => {
      if (err) {
        console.log("DB error:", err);
        return res.status(500).send("DB error");
      }
      console.log("📡 Sensor update:", zone, temperature, moisture);
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
    console.log("Weather error:", err.message);
    res.status(500).send("Weather error");
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
    res.json(
      response.data.list.map((f) => ({
        time:      f.dt,
        temp:      f.main.temp,
        condition: f.weather[0].main,
      }))
    );
  } catch (err) {
    console.log("Forecast error:", err.message);
    res.status(500).send("Forecast error");
  }
});

// ── POST /api/irrigation ─────────────────────────────────────
// NOW protected by JWT (was completely open before)
app.post("/api/irrigation", verifyToken, (req, res) => {
  const { zone, status } = req.body;
  if (!zone || !status) return res.status(400).json({ error: "Missing zone or status" });

  const command = status;

  db.query(
    "INSERT INTO irrigation_logs (zone, status, reason, decision_score) VALUES (?, ?, ?, ?)",
    [zone, command, "MANUAL", null],
    (err) => {
      if (err) console.log(err);
    }
  );

  res.json({ success: true });
});

// ── GET /api/history ─────────────────────────────────────────
app.get("/api/history", verifyToken, (req, res) => {
  db.query(
    "SELECT * FROM irrigation_logs ORDER BY created_at DESC",
    (err, result) => {
      if (err) {
        console.log("❌ HISTORY ERROR:", err);
        return res.status(500).json(err);
      }
      res.json(result);
    }
  );
});

// ── GET /api/alerts ──────────────────────────────────────────
app.get("/api/alerts", (req, res) => {
  db.query(
    `SELECT zone, moisture, 'DRY' as type FROM zones WHERE moisture < 40
     UNION
     SELECT zone, 0 as moisture, 'SMART' as type FROM irrigation_logs
     WHERE status = 'SMART ON'
     AND created_at >= NOW() - INTERVAL 1 MINUTE`,
    (err, result) => {
      if (err) return res.status(500).send("DB error");
      res.json(result);
    }
  );
});

// ── GET /api/command ─────────────────────────────────────────
// NOW protected by ESP32 API key (was unprotected before)
// NOW saves decision_score to irrigation_logs
app.get("/api/command", verifyESP32, (req, res) => {
  const zone = req.query.zone || 1;

  db.query(
    "SELECT moisture, temperature FROM zones WHERE zone=?",
    [zone],
    (err, result) => {
      if (err || result.length === 0) {
        return res.json({ irrigate: false });
      }

      const { moisture, temperature } = result[0];

      db.query(
        "SELECT status FROM irrigation_logs WHERE zone=? ORDER BY id DESC LIMIT 1",
        [zone],
        (err2, last) => {
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
              // Smart decision
              (async () => {
                const weather  = await getWeather();
                const forecast = await getForecast();
                const decision = shouldIrrigate({ moisture, temperature }, weather, forecast);

                irrigate = decision.irrigate;
                score    = decision.score;
                reason   = `Score: ${decision.score} | Moisture: ${moisture} | Temp: ${temperature}`;

                console.log("🧠 SMART Decision:", zone, irrigate, decision.score);

                // Save with decision_score
                db.query(
                  "INSERT INTO irrigation_logs (zone, status, reason, decision_score) VALUES (?, ?, ?, ?)",
                  [zone, irrigate ? "SMART ON" : "SMART OFF", reason, score]
                );
              })();
            }
          } else {
            irrigate = moisture < 40 || temperature > 32;
          }

          // Track water usage
          const key = `zone_${zone}`;
          if (irrigate) {
            if (!activeIrrigation[key]) {
              activeIrrigation[key] = { startTime: Date.now() };
            }
          } else {
            if (activeIrrigation[key]) {
              const duration = Math.round(
                (Date.now() - activeIrrigation[key].startTime) / 1000
              );
              db.query(
                `UPDATE irrigation_logs SET duration_seconds=? WHERE zone=? ORDER BY id DESC LIMIT 1`,
                [duration, zone]
              );
              console.log(`💧 Zone ${zone} used water for ${duration}s`);
              delete activeIrrigation[key];
            }
          }

          res.json({ irrigate });
        }
      );
    }
  );
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

  const interval = setInterval(send, 3000);
  req.on("close", () => clearInterval(interval));
});

// ── GET /api/water-stats ─────────────────────────────────────
app.get("/api/water-stats", verifyToken, (req, res) => {
  const todayQuery = `
    SELECT SUM(duration_seconds) as total
    FROM irrigation_logs
    WHERE DATE(created_at) = CURDATE()
  `;
  const weekQuery = `
    SELECT DATE(created_at) as day, SUM(duration_seconds) as total
    FROM irrigation_logs
    WHERE created_at >= NOW() - INTERVAL 7 DAY
    GROUP BY day ORDER BY day ASC
  `;

  db.query(todayQuery, (err1, todayRes) => {
    if (err1) return res.status(500).json(err1);
    db.query(weekQuery, (err2, weekRes) => {
      if (err2) return res.status(500).json(err2);

      const todaySeconds = todayRes[0].total || 0;
      const todayLiters  = (todaySeconds / 60) * FLOW_RATE;
      const weekly       = weekRes.map((r) => ({
        day:    r.day,
        liters: ((r.total || 0) / 60) * FLOW_RATE,
      }));

      res.json({ today: todayLiters, weekly });
    });
  });
});

// ============================================================
// DECISION ENGINE
// ============================================================
function shouldIrrigate(zone, weather = {}, forecast = []) {
  let score = 0;

  if (zone.moisture < 60) score += Math.max(0, (60 - zone.moisture) * 0.67);
  if (zone.temperature > 32) score += (zone.temperature - 32) * 2;
  if (weather.rain) score -= 20;

  const rainComing = forecast.slice(0, 3).some((f) =>
    f.condition?.toLowerCase().includes("rain")
  );
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
    console.log("Weather error:", err.message);
    return { temp: 0, humidity: 0, rain: false };
  }
}

async function getForecast(lat = 34.74, lon = 10.76) {
  try {
    const res = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${process.env.WEATHER_API_KEY}&units=metric`
    );
    return res.data.list;
  } catch (err) {
    console.log("Forecast error:", err.message);
    return [];
  }
}

// ============================================================
// AUTO IRRIGATION CRON (every 5 seconds)
// ============================================================
async function autoIrrigation() {
  const weather  = await getWeather();
  const forecast = await getForecast();

  db.query("SELECT zone, moisture, temperature FROM zones", (err, zones) => {
    if (err) return;

    zones.forEach((zone) => {
      let score = 0;

      if (zone.moisture < 35)      score += 2;
      else if (zone.moisture < 45) score += 1;
      if (zone.temperature > 32)   score += 1;

      const humidity   = weather?.humidity ?? 0;
      const rain       = weather?.rain     ?? false;

      if (humidity < 50) score += 1;
      if (rain)          score -= 3;

      const hour        = new Date().getHours();
      const isGoodTime  = hour < 10 || hour > 18;

      console.log(`Zone ${zone.zone} | Score: ${score} | GoodTime: ${isGoodTime}`);

      if (score >= 2) {
        db.query(
          "SELECT * FROM irrigation_logs WHERE zone=? ORDER BY id DESC LIMIT 1",
          [zone.zone],
          (err, last) => {
            if (err) return;

            if (last.length) {
              const diffMinutes =
                (new Date() - new Date(last[0].created_at)) / 1000 / 60;
              if (diffMinutes < 0.2) {
                console.log(`⛔ Zone ${zone.zone} skipped (cooldown)`);
                return;
              }
            }

            const reason = `Moisture: ${zone.moisture}% | Temp: ${zone.temperature}°C | Humidity: ${humidity}% | Rain: ${rain} | Score: ${score}`;

            console.log(`✅ SMART irrigation → Zone ${zone.zone}`);

            db.query(
              "INSERT INTO irrigation_logs (zone, status, reason, decision_score) VALUES (?, ?, ?, ?)",
              [zone.zone, "SMART ON", reason, score]
            );

            db.query(
              "UPDATE zones SET moisture = moisture + 10 WHERE zone = ?",
              [zone.zone]
            );
          }
        );
      }
    });
  });
}

setInterval(autoIrrigation, 5000);

// ============================================================
// SERVER START
// ============================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on port " + PORT));