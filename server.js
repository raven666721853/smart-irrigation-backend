const express = require("express");
const cors = require("cors");
const db = require("./db");
const axios = require("axios");

const app = express();

app.use(cors());
app.use(express.json());



// ================= ROUTES =================
console.log("🔥 NEW VERSION DEPLOYED");

// 🔐 AUTH
app.get("/", (req, res) => {
  res.send("Backend is working 🚀");
});

app.use("/api/auth", require("./routes/auth"));

// 🌱 GET ZONES
app.get("/api/zones", (req, res) => {
  db.query(
    "SELECT zone, moisture, temperature FROM zones",
    (err, result) => {
      if (err) return res.status(500).send("DB error");
      res.json(result);
    }
  );
});

// 🌦️ WEATHER API
app.get("/api/weather", async (req, res) => {
  const lat = req.query.lat || 34.74;
  const lon = req.query.lon || 10.76;

  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=42662c129ec0a46f1fa183705bdcd9d6&units=metric`
    );

    res.json({
  city: response.data.name, // 🌍 NEW
  temp: response.data.main.temp,
  humidity: response.data.main.humidity,
  rain: response.data.weather[0].main.toLowerCase().includes("rain"),
  condition: response.data.weather[0].main // ☀️ Cloudy, Clear, Rain...
});

  } catch (err) {
    console.log("Weather error:", err.message);
    res.status(500).send("Weather error");
  }
});
app.get("/api/forecast", async (req, res) => {
  const lat = req.query.lat || 34.74;
  const lon = req.query.lon || 10.76;

  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=42662c129ec0a46f1fa183705bdcd9d6&units=metric`
    );

    res.json(
  response.data.list.map(f => ({
    time: f.dt,
    temp: f.main.temp,
    condition: f.weather[0].main
  }))
);

  } catch (err) {
    console.log("Forecast error:", err.message);
    res.status(500).send("Forecast error");
  }
});
// 💧 MANUAL IRRIGATION
app.post("/api/irrigation", (req, res) => {
  const { zone, status } = req.body;

  const command = status; // keep MANUAL ON / OFF
  commands[zone] = command;

  // 🔥 SAVE TO DB
  db.query(
    "INSERT INTO irrigation_logs (zone, status, reason) VALUES (?, ?, ?)",
    [zone, command, "MANUAL"],
    (err) => {
      if (err) console.log(err);
    }
  );

  res.json({ success: true });
});

// 📊 HISTORY
app.get("/api/history", (req, res) => {
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

// 🚨 ALERTS
app.get("/api/alerts", (req, res) => {
  db.query(
    `
    SELECT zone, moisture, 'DRY' as type FROM zones WHERE moisture < 40
    UNION
    SELECT zone, 0 as moisture, 'SMART' as type FROM irrigation_logs
    WHERE status = 'SMART ON'
    AND created_at >= NOW() - INTERVAL 1 MINUTE
    `,
    (err, result) => {
      if (err) return res.status(500).send("DB error");
      res.json(result);
    }
  );
});
// 📡 RECEIVE SENSOR DATA FROM ESP32
app.post("/api/sensor", (req, res) => {
  const { zone, temperature, moisture } = req.body;

  if (!zone) return res.status(400).send("Missing zone");

  db.query(
    "UPDATE zones SET temperature=?, moisture=? WHERE zone=?",
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
// 🎯 COMMAND FOR ESP32
app.get("/api/command", (req, res) => {
  const zone = req.query.zone || 1;

  db.query(
    "SELECT moisture, temperature FROM zones WHERE zone=?",
    [zone],
    (err, result) => {
      if (err || result.length === 0) {
        return res.json({ irrigate: false });
      }

      const { moisture, temperature } = result[0];

      // 🟢 1. CHECK MANUAL COMMAND FIRST
      db.query(
        "SELECT status FROM irrigation_logs WHERE zone=? ORDER BY id DESC LIMIT 1",
        [zone],
        (err2, last) => {

          let irrigate = false;
          let reason = "AUTO";

          if (last && last.length) {
            const lastStatus = last[0].status;

            if (lastStatus === "MANUAL ON") {
              irrigate = true;
              reason = "MANUAL";
            } else if (lastStatus === "MANUAL OFF") {
              irrigate = false;
              reason = "MANUAL";
            } else {
              // 🤖 AUTO LOGIC
              irrigate = (moisture < 40 || temperature > 32);
            }
          } else {
            // 🤖 AUTO LOGIC (no manual history)
            irrigate = (moisture < 40 || temperature > 32);
          }

          console.log("🤖 Decision:", zone, irrigate, reason);

          // 🔥 SAVE HISTORY HERE
          db.query(
            "INSERT INTO irrigation_logs (zone, status, reason) VALUES (?, ?, ?)",
            [zone, irrigate ? "SMART ON" : "SMART OFF", reason],
            (err3) => {
              if (err3) console.log("Log error:", err3);
            }
          );
 

          res.json({ irrigate });
        }
      );
    }
  );
});

// ================= WEATHER =================

// ✅ FIXED
async function getWeather(lat = 34.74, lon = 10.76) {
  try {
    const res = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=42662c129ec0a46f1fa183705bdcd9d6&units=metric`
    );

    return {
      temp: res.data?.main?.temp ?? 0,
      humidity: res.data?.main?.humidity ?? 0,
      rain:
        res.data?.weather?.[0]?.main?.toLowerCase().includes("rain") || false,
    };
  } catch (err) {
    console.log("Weather error:", err.message);
    return { temp: 0, humidity: 0, rain: false };
  }
}

// ✅ NEW (CORRECT PLACE)
async function getForecast(lat = 34.74, lon = 10.76) {
  try {
    const res = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=42662c129ec0a46f1fa183705bdcd9d6&units=metric`
    );

    return res.data.list;
  } catch (err) {
    console.log("Forecast error:", err.message);
    return [];
  }
}

async function autoIrrigation() {
  const lat = 34.74;
  const lon = 10.76;

  const weather = await getWeather(lat, lon);
  const forecast = await getForecast(lat, lon);

  db.query("SELECT zone, moisture, temperature FROM zones", (err, zones) => {
    if (err) return;

    zones.forEach((zone) => {
      let score = 0;

      // 🌱 Soil
      if (zone.moisture < 35) score += 2;
      else if (zone.moisture < 45) score += 1;

      // 🌡️ Temp
      if (zone.temperature > 32) score += 1;

      // 🌦️ Weather
      const humidity = weather?.humidity ?? 0;
      const rain = weather?.rain ?? false;

      if (humidity < 50) score += 1;
      if (rain) score -= 3;

      // 🌧️ Forecast
      const rainComing = forecast.slice(0, 3).some((f) =>
        f.weather[0].main.toLowerCase().includes("rain")
      );

      // ⏱️ Time logic
      const now = new Date();
      const hour = now.getHours();

      let nextIrrigation = new Date();

      if (hour < 10) {
        nextIrrigation.setHours(6, 0, 0, 0);
      } else if (hour < 18) {
        nextIrrigation.setHours(18, 0, 0, 0);
      } else {
        nextIrrigation.setDate(now.getDate() + 1);
        nextIrrigation.setHours(6, 0, 0, 0);
      }

      const isGoodTime = hour < 10 || hour > 18;

      console.log(`
Zone ${zone.zone}
Score: ${score}
RainComing: ${rainComing}
GoodTime: ${isGoodTime}
`);

      // 🎯 DECISION
      if (score >= 2) {

        db.query(
          "SELECT * FROM irrigation_logs WHERE zone=? ORDER BY id DESC LIMIT 1",
          [zone.zone],
          (err, last) => {

            if (err) return;

            // 🚨 COOLDOWN (VERY IMPORTANT)
            if (last.length) {
              const lastTime = new Date(last[0].created_at);
              const now = new Date();

              const diffMinutes = (now - lastTime) / 1000 / 60;

              const COOLDOWN_MINUTES = 0.2; 

              if (diffMinutes < COOLDOWN_MINUTES) {
                console.log(`⛔ Zone ${zone.zone} skipped (cooldown)`);
                return;
              }
            }

            // 🧠 REASON
            const reason = `
Moisture: ${zone.moisture}%
Temp: ${zone.temperature}°C
Humidity: ${humidity}%
Rain: ${rain}
Score: ${score}
Next irrigation: ${nextIrrigation.toLocaleString()}
`;

            console.log(`✅ SMART irrigation → Zone ${zone.zone}`);

            // 💾 SAVE
            db.query(
              "INSERT INTO irrigation_logs (zone, status, reason) VALUES (?, ?, ?)",
              [zone.zone, "SMART ON", reason]
            );

            // 💧 APPLY
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

// ================= INTERVAL =================
setInterval(autoIrrigation, 5000);

// ================= SERVER =================


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});