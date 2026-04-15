"""Constants for the WaterAlarm integration."""

DOMAIN = "wateralarm"
MANUFACTURER = "WaterAlarm"

CONF_API_URL = "api_url"
CONF_SENSOR_NAME = "sensor_name"
CONF_SCAN_INTERVAL = "scan_interval"

DEFAULT_SCAN_INTERVAL = 300  # 5 minutes — sensors typically report every 10-15 min
DEFAULT_NAME = "Regenput"

API_BASE = "https://www.wateralarm.be/api"
