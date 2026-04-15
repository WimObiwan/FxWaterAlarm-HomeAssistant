"""The WaterAlarm integration."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import CONF_API_URL, CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL, DOMAIN
from .coordinator import WaterAlarmCoordinator

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.SENSOR]

CARD_URL = f"/{DOMAIN}/wateralarm-card.js"
CARD_FILE = Path(__file__).parent / "www" / "wateralarm-card.js"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register the static path for the Lovelace card."""
    # Serve the JS file at /wateralarm/wateralarm-card.js
    await hass.http.async_register_static_paths(
        [StaticPathConfig(CARD_URL, str(CARD_FILE), True)]
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up WaterAlarm from a config entry."""
    coordinator = WaterAlarmCoordinator(
        hass,
        api_url=entry.data[CONF_API_URL],
        scan_interval=entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
    )

    await coordinator.async_config_entry_first_refresh()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    # Auto-register the Lovelace resource (only once)
    await _register_card_resource(hass)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if unload_ok := await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok


async def _register_card_resource(hass: HomeAssistant) -> None:
    """Register the card JS as a Lovelace resource if not already present."""
    try:
        # Access the Lovelace resource storage
        resources = hass.data.get("lovelace_resources")
        if resources is None:
            _LOGGER.debug(
                "Lovelace resources not available (YAML mode?) — "
                "add the card resource manually: %s",
                CARD_URL,
            )
            return

        # Check if already registered
        existing = [
            r
            for r in resources.async_items()
            if r.get("url", "").startswith(f"/{DOMAIN}/")
        ]
        if existing:
            return

        await resources.async_create_item({"res_type": "module", "url": CARD_URL})
        _LOGGER.info("Registered WaterAlarm Lovelace card resource")

    except Exception:  # noqa: BLE001
        _LOGGER.debug(
            "Could not auto-register the Lovelace card resource. "
            "You can add it manually: %s",
            CARD_URL,
            exc_info=True,
        )
