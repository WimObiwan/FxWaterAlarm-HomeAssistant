"""DataUpdateCoordinator for WaterAlarm."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, SENSOR_TYPE_LEVEL

_LOGGER = logging.getLogger(__name__)


class WaterAlarmCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinator to fetch data from the WaterAlarm API."""

    def __init__(
        self,
        hass: HomeAssistant,
        api_url: str,
        scan_interval: int,
    ) -> None:
        """Initialise the coordinator."""
        self.api_url = api_url
        self._session = async_get_clientsession(hass)

        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan_interval),
        )

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch data from the WaterAlarm API."""
        try:
            async with self._session.get(
                self.api_url, timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status != 200:
                    raise UpdateFailed(
                        f"API returned HTTP {resp.status}"
                    )
                data = await resp.json(content_type=None)

        except aiohttp.ClientError as err:
            raise UpdateFailed(f"Communication error: {err}") from err
        except (ValueError, KeyError) as err:
            raise UpdateFailed(f"Invalid API response: {err}") from err

        if not data:
            raise UpdateFailed("Empty response from API")

        _LOGGER.debug("WaterAlarm API response: %s", data)
        return data

    # ------------------------------------------------------------------
    # Convenience helpers to extract values safely from the response.
    #
    # API shape:
    #   {
    #     "sensor": { "sensorType": "Level" | "LevelPressure" | ... },
    #     "accountSensor": { "name": "...", "capacityL": ..., ... },
    #     "lastMeasurement": { ... },
    #     "trends": { ... }
    #   }
    #
    # Fields in lastMeasurement vary by sensorType:
    #   Level/LevelPressure: waterL, levelFraction, distanceMm, heightMm, batV, batteryPrc
    #   Detect:              status, batV, batteryPrc
    #   Moisture:            soilMoisturePrc, soilConductivity, soilTemperatureC, batV, batteryPrc
    #   Thermometer:         tempC, humPrc, batV, batteryPrc
    #
    # All types share: timeStamp, rssiDbm, rssiPrc, estimatedNextRefresh
    # ------------------------------------------------------------------

    # ── Shared helpers ──

    @staticmethod
    def _m(data: dict) -> dict | None:
        """Return the lastMeasurement dict or None."""
        return data.get("lastMeasurement") if data else None

    @staticmethod
    def get_sensor_type(data: dict) -> str:
        """Return the sensor type string, defaulting to Level."""
        if data:
            s = data.get("sensor")
            if s and "sensorType" in s:
                return s["sensorType"]
        return SENSOR_TYPE_LEVEL

    @staticmethod
    def get_sensor_name(data: dict) -> str | None:
        """Return sensor name from the API."""
        as_ = data.get("accountSensor") if data else None
        return as_.get("name") if as_ else None

    @staticmethod
    def get_last_update(data: dict) -> str | None:
        """Return ISO timestamp of last measurement."""
        m = WaterAlarmCoordinator._m(data)
        return m.get("timeStamp") if m else None

    @staticmethod
    def get_battery(data: dict) -> float | None:
        """Return battery voltage."""
        m = WaterAlarmCoordinator._m(data)
        return float(m["batV"]) if m and "batV" in m else None

    @staticmethod
    def get_battery_pct(data: dict) -> float | None:
        """Return battery percentage."""
        m = WaterAlarmCoordinator._m(data)
        if m and "batteryPrc" in m:
            return round(float(m["batteryPrc"]), 0)
        return None

    @staticmethod
    def get_rssi(data: dict) -> float | None:
        """Return RSSI in dBm."""
        m = WaterAlarmCoordinator._m(data)
        return float(m["rssiDbm"]) if m and "rssiDbm" in m else None

    # ── Level / LevelPressure ──

    @staticmethod
    def get_level_percent(data: dict) -> float | None:
        """Return water level as a percentage."""
        m = WaterAlarmCoordinator._m(data)
        if m is None:
            return None
        frac = m.get("levelFraction")
        if frac is None:
            return None
        return round(float(frac) * 100.0, 1)

    @staticmethod
    def get_volume(data: dict) -> float | None:
        """Return water volume in litres."""
        m = WaterAlarmCoordinator._m(data)
        return float(m["waterL"]) if m and "waterL" in m else None

    @staticmethod
    def get_distance(data: dict) -> float | None:
        """Return distance in mm."""
        m = WaterAlarmCoordinator._m(data)
        return float(m["distanceMm"]) if m and "distanceMm" in m else None

    @staticmethod
    def get_capacity(data: dict) -> float | None:
        """Return total tank capacity in litres."""
        as_ = data.get("accountSensor") if data else None
        return float(as_["usableCapacity"]) if as_ and "usableCapacity" in as_ else None

    # ── Detect ──

    @staticmethod
    def get_detect_status(data: dict) -> bool | None:
        """Return water detection status. 0=dry, 1=wet."""
        m = WaterAlarmCoordinator._m(data)
        if m is None or "status" not in m:
            return None
        return int(m["status"]) == 1

    # ── Thermometer ──

    @staticmethod
    def get_temperature(data: dict) -> float | None:
        """Return temperature in °C."""
        m = WaterAlarmCoordinator._m(data)
        return float(m["tempC"]) if m and "tempC" in m else None

    @staticmethod
    def get_humidity(data: dict) -> float | None:
        """Return relative humidity in %."""
        m = WaterAlarmCoordinator._m(data)
        return float(m["humPrc"]) if m and "humPrc" in m else None

    # ── Moisture ──

    @staticmethod
    def get_soil_moisture(data: dict) -> float | None:
        """Return soil moisture in %."""
        m = WaterAlarmCoordinator._m(data)
        return float(m["soilMoisturePrc"]) if m and "soilMoisturePrc" in m else None

    @staticmethod
    def get_soil_conductivity(data: dict) -> int | None:
        """Return soil conductivity (µS/cm)."""
        m = WaterAlarmCoordinator._m(data)
        return int(m["soilConductivity"]) if m and "soilConductivity" in m else None

    @staticmethod
    def get_soil_temperature(data: dict) -> float | None:
        """Return soil temperature in °C."""
        m = WaterAlarmCoordinator._m(data)
        return float(m["soilTemperatureC"]) if m and "soilTemperatureC" in m else None
