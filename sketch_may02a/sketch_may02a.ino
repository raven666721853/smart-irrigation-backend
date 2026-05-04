#include <WiFi.h>
#include <HTTPClient.h>

// 🔐 WIFI
const char* ssid = "taki";
const char* password = "12345678";

// 🌐 BACKEND
String server = "https://smart-irrigation-backend-wra6.onrender.com/api";

// 📡 PINS
int sensorPin = 34;
int relayPin = 26;

void setup() {
  Serial.begin(115200);

  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, HIGH); // OFF

  WiFi.begin(ssid, password);

  Serial.println("Connecting to WiFi...");

  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("...");
  }

  Serial.println("✅ WiFi connected");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {

    // 🌱 READ SENSOR
    int raw = analogRead(sensorPin);

Serial.print("RAW: ");
Serial.println(raw);

// 🎮 SIMULATED SENSOR (no real sensor)
int moisture = random(25, 70);   // between dry and wet
int temperature = random(20, 35);

Serial.print("Simulated Moisture: ");
Serial.println(moisture);

   
    // 📡 SEND DATA TO BACKEND
    HTTPClient http;
    http.begin(server + "/sensor");
    http.addHeader("Content-Type", "application/json");

String json = "{\"zone\":1,\"moisture\":" + String(moisture) + ",\"temperature\":" + String(temperature) + "}";

    int postCode = http.POST(json);

    Serial.print("POST response: ");
    Serial.println(postCode);

    http.end();

    // 📥 GET COMMAND FROM BACKEND
    HTTPClient http2;
    http2.begin(server + "/command?zone=1");

    int code = http2.GET();

    if (code == 200) {
      String payload = http2.getString();

      Serial.print("Command: ");
      Serial.println(payload);

      if (payload.indexOf("true") >= 0) {
        digitalWrite(relayPin, LOW);  // ON
        Serial.println("💧 PUMP ON");
      } else {
        digitalWrite(relayPin, HIGH); // OFF
        Serial.println("🛑 PUMP OFF");
      }
    } else {
      Serial.print("GET error: ");
      Serial.println(code);
    }

    http2.end();
  }

  delay(5000); // every 5 seconds
}
