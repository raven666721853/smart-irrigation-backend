module.exports = (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(403).json({
        success: false,
        message: "Missing API key",
      });
    }

    if (apiKey !== process.env.ESP32_API_KEY) {
      return res.status(403).json({
        success: false,
        message: "Invalid API key",
      });
    }

    next();

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "ESP32 auth error",
    });
  }
};