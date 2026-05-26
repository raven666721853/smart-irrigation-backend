module.exports = (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(403).json({ success: false, message: "Missing API key" });
    }

    if (!process.env.ESP32_API_KEY) {
      console.error("❌ ESP32_API_KEY is not set in environment variables");
      return res.status(500).json({ success: false, message: "Server misconfiguration" });
    }

    if (apiKey !== process.env.ESP32_API_KEY) {
      return res.status(403).json({ success: false, message: "Invalid API key" });
    }

    next();
  } catch (error) {
    console.error("ESP32 auth error:", error.message);
    return res.status(500).json({ success: false, message: "ESP32 auth error" });
  }
};
