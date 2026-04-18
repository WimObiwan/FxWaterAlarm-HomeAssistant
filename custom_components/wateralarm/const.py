"""Constants for the WaterAlarm integration."""

DOMAIN = "wateralarm"
MANUFACTURER = "WaterAlarm"

CONF_API_URL = "api_url"
CONF_SENSOR_NAME = "sensor_name"
CONF_SCAN_INTERVAL = "scan_interval"

DEFAULT_SCAN_INTERVAL = 300  # 5 minutes — sensors typically report every 10-15 min
DEFAULT_NAME = "Sensor"

API_BASE = "https://www.wateralarm.be/api"

# Sensor types as returned by the API (sensor.sensorType)
SENSOR_TYPE_LEVEL = "Level"
SENSOR_TYPE_LEVEL_PRESSURE = "LevelPressure"
SENSOR_TYPE_DETECT = "Detect"
SENSOR_TYPE_MOISTURE = "Moisture"
SENSOR_TYPE_THERMOMETER = "Thermometer"

# Group Level and LevelPressure — same entity set
LEVEL_TYPES = {SENSOR_TYPE_LEVEL, SENSOR_TYPE_LEVEL_PRESSURE}

# Model names per sensor type (shown in device info)
MODEL_NAMES = {
    SENSOR_TYPE_LEVEL: "Water Level Sensor (Ultrasonic)",
    SENSOR_TYPE_LEVEL_PRESSURE: "Water Level Sensor (Pressure)",
    SENSOR_TYPE_DETECT: "Water Detection Sensor",
    SENSOR_TYPE_MOISTURE: "Soil Moisture Sensor",
    SENSOR_TYPE_THERMOMETER: "Temperature & Humidity Sensor",
}
