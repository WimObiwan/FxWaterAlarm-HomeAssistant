"""DataUpdateCoordinator for WaterAlarm."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN

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
    # Actual API shape:
    #   {
    #     "accountSensor": {
    #       "name": "Buiten",
    #       "capacityL": 18000,
    #       "usableCapacity": 17241,
    #       ...
    #     },
    #     "lastMeasurement": {
    #       "timeStamp": "2026-04-15T19:28:11Z",
    #       "waterL": 3283.56,
    #       "levelFraction": 0.19,
    #       "batV": 3.287,
    #       "batteryPrc": 85.67,
    #       "rssiDbm": -91,
    #       "distanceMm": 2003,
    #       "heightMm": 373,
    #       ...
    #     },
    #     "trends": { ... }
    #   }
    # We access values defensively so the integration keeps working
    # even if the API adds/removes fields.
    # ------------------------------------------------------------------

    @staticmethod
    def _m(data: dict) -> dict | None:
        """Return the lastMeasurement dict or None."""
        return data.get("lastMeasurement") if data else None

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
    def get_distance(data: dict) -> float | None:
        """Return distance in mm."""
        m = WaterAlarmCoordinator._m(data)
        return float(m["distanceMm"]) if m and "distanceMm" in m else None

    @staticmethod
    def get_last_update(data: dict) -> str | None:
        """Return ISO timestamp of last measurement."""
        m = WaterAlarmCoordinator._m(data)
        return m.get("timeStamp") if m else None

    @staticmethod
    def get_sensor_name(data: dict) -> str | None:
        """Return sensor name from the API (if present)."""
        as_ = data.get("accountSensor") if data else None
        return as_.get("name") if as_ else None

    @staticmethod
    def get_capacity(data: dict) -> float | None:
        """Return total tank capacity in litres."""
        as_ = data.get("accountSensor") if data else None
        return float(as_["usableCapacity"]) if as_ and "usableCapacity" in as_ else None