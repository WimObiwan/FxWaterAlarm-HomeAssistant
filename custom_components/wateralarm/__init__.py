"""The WaterAlarm integration."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, Platform
from homeassistant.core import CoreState, HomeAssistant
from homeassistant.helpers.event import async_call_later

from .const import CONF_API_URL, CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL, DOMAIN
from .coordinator import WaterAlarmCoordinator

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.BINARY_SENSOR]

CARD_URL = f"/{DOMAIN}/wateralarm-card.js"
CARD_DIR = Path(__file__).parent / "www"

# Read version from manifest.json for cache busting
_MANIFEST = Path(__file__).parent / "manifest.json"
with open(_MANIFEST, encoding="utf-8") as _f:
    VERSION = json.load(_f).get("version", "0.0.0")


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the WaterAlarm component."""
    # Serve the www/ directory at /wateralarm/
    await hass.http.async_register_static_paths(
        [StaticPathConfig(f"/{DOMAIN}", str(CARD_DIR), False)]
    )

    # Register the Lovelace card resource after HA is fully started
    async def _setup_frontend(_event: Any = None) -> None:
        await _register_card_resource(hass)

    if hass.state == CoreState.running:
        await _setup_frontend()
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _setup_frontend)

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
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if unload_ok := await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok


async def _register_card_resource(hass: HomeAssistant) -> None:
    """Register or update the card JS as a Lovelace resource."""
    versioned_url = f"{CARD_URL}?v={VERSION}"

    try:
        lovelace = hass.data.get("lovelace")
        if lovelace is None:
            _LOGGER.debug("Lovelace not available")
            return

        # Only auto-register in storage mode; YAML mode users must add it manually
        if lovelace.resource_mode != "storage":
            _LOGGER.debug(
                "Lovelace is in YAML mode — add the card resource manually: %s",
                CARD_URL,
            )
            return

        # Resources may not be loaded yet — wait and retry
        if not lovelace.resources.loaded:
            _LOGGER.debug("Lovelace resources not loaded yet, retrying in 5s")

            async def _retry(_now: Any) -> None:
                await _register_card_resource(hass)

            async_call_later(hass, 5, _retry)
            return

        # Find any existing WaterAlarm resource
        existing = [
            r
            for r in lovelace.resources.async_items()
            if r["url"].split("?")[0] == CARD_URL
        ]

        if existing:
            resource = existing[0]
            if resource["url"] == versioned_url:
                _LOGGER.debug("WaterAlarm card resource already up to date (v%s)", VERSION)
                return
            # Version changed — update the resource to bust the cache
            _LOGGER.info(
                "Updating WaterAlarm card resource: %s → %s",
                resource["url"],
                versioned_url,
            )
            await lovelace.resources.async_update_item(
                resource["id"],
                {"res_type": "module", "url": versioned_url},
            )
            return

        # First install — create the resource
        await lovelace.resources.async_create_item(
            {"res_type": "module", "url": versioned_url}
        )
        _LOGGER.info("Registered WaterAlarm Lovelace card resource: %s", versioned_url)

    except Exception:  # noqa: BLE001
        _LOGGER.warning(
            "Could not auto-register the Lovelace card resource. "
            "Add it manually: Settings → Dashboards → Resources → %s",
            CARD_URL,
            exc_info=True,
        )
