"""Diagnostics support for WaterAlarm."""

from __future__ import annotations

import re
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import CONF_API_URL, DOMAIN
from .coordinator import WaterAlarmCoordinator

_REDACT_RE = re.compile(r"/s/[A-Za-z0-9_-]+")


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for a config entry."""
    coordinator: WaterAlarmCoordinator = hass.data[DOMAIN][entry.entry_id]

    # Redact the sensor secret from the URL
    redacted_url = _REDACT_RE.sub("/s/***REDACTED***", entry.data.get(CONF_API_URL, ""))

    return {
        "config_entry": {
            "title": entry.title,
            "api_url": redacted_url,
        },
        "api_data": coordinator.data,
    }
