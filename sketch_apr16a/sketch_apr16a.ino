#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT11

#define LED_PIN 2

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  dht.begin();

  Serial.println("🚀 System started");
}

void loop() {

  float temperature = dht.readTemperature();

  // check if sensor works
  if (isnan(temperature)) {
    Serial.println("❌ Failed to read from DHT11");
    delay(2000);
    return;
  }

  Serial.print("🌡 Temperature: ");
  Serial.print(temperature);
  Serial.println(" °C");

  // 💡 LED CONTROL
  if (temperature > 28) {
    digitalWrite(LED_PIN, HIGH);
    Serial.println("💡 LED ON (HOT)");
  } else {
    digitalWrite(LED_PIN, LOW);
    Serial.println("🛑 LED OFF");
  }

  delay(2000);
}
