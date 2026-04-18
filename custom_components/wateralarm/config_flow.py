"""Config flow for WaterAlarm integration."""

from __future__ import annotations

import logging
import re
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    CONF_API_URL,
    CONF_SCAN_INTERVAL,
    CONF_SENSOR_NAME,
    DEFAULT_NAME,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

# Regex to extract the /a/{account}/s/{sensor} part from various URL formats
_PATH_RE = re.compile(
    r"(?:https?://(?:www\.)?wateralarm\.be)?/?"
    r"(?:api/)?"
    r"(a/[^/]+/s/[A-Za-z0-9_-]+)"
)


def _normalise_url(user_input: str) -> str | None:
    """Accept many URL formats and return the canonical API URL.

    Accepted formats:
      https://www.wateralarm.be/a/demo/s/xyz
      https://wateralarm.be/api/a/demo/s/xyz
      wateralarm.be/a/demo/s/xyz
      a/demo/s/xyz
    """
    user_input = user_input.strip().rstrip("/")
    m = _PATH_RE.search(user_input)
    if m:
        return f"https://www.wateralarm.be/api/{m.group(1)}"
    return None


class WaterAlarmConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for WaterAlarm."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle the initial step — user pastes the sensor URL."""
        errors: dict[str, str] = {}

        if user_input is not None:
            raw_url = user_input.get(CONF_API_URL, "")
            api_url = _normalise_url(raw_url)

            if api_url is None:
                errors[CONF_API_URL] = "invalid_url"
            else:
                # Prevent duplicates
                await self.async_set_unique_id(api_url)
                self._abort_if_unique_id_configured()

                # Validate that the API actually responds
                session = async_get_clientsession(self.hass)
                try:
                    async with session.get(
                        api_url, timeout=aiohttp.ClientTimeout(total=15)
                    ) as resp:
                        if resp.status != 200:
                            errors[CONF_API_URL] = "cannot_connect"
                        else:
                            data = await resp.json(content_type=None)
                            # All sensor types have accountSensor and
                            # lastMeasurement at minimum
                            if not data or "accountSensor" not in data:
                                errors[CONF_API_URL] = "invalid_response"
                except (aiohttp.ClientError, TimeoutError):
                    errors[CONF_API_URL] = "cannot_connect"
                except (ValueError, KeyError):
                    errors[CONF_API_URL] = "invalid_response"

                if not errors:
                    name = user_input.get(CONF_SENSOR_NAME, "").strip()
                    if not name:
                        # Try to derive from API response
                        name = data.get("accountSensor", {}).get("name", DEFAULT_NAME)

                    return self.async_create_entry(
                        title=name,
                        data={
                            CONF_API_URL: api_url,
                            CONF_SENSOR_NAME: name,
                            CONF_SCAN_INTERVAL: user_input.get(
                                CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL
                            ),
                        },
                    )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_API_URL): str,
                    vol.Optional(CONF_SENSOR_NAME, default=""): str,
                    vol.Optional(
                        CONF_SCAN_INTERVAL, default=DEFAULT_SCAN_INTERVAL
                    ): vol.All(int, vol.Range(min=60, max=3600)),
                }
            ),
            errors=errors,
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle reconfiguration."""
        errors: dict[str, str] = {}

        if user_input is not None:
            raw_url = user_input.get(CONF_API_URL, "")
            api_url = _normalise_url(raw_url)

            if api_url is None:
                errors[CONF_API_URL] = "invalid_url"
            else:
                name = user_input.get(CONF_SENSOR_NAME, "").strip()
                if not name:
                    name = DEFAULT_NAME

                return self.async_update_reload_and_abort(
                    self._get_reconfigure_entry(),
                    data={
                        CONF_API_URL: api_url,
                        CONF_SENSOR_NAME: name,
                        CONF_SCAN_INTERVAL: user_input.get(
                            CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL
                        ),
                    },
                )

        entry = self._get_reconfigure_entry()
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_API_URL, default=entry.data.get(CONF_API_URL, "")
                    ): str,
                    vol.Optional(
                        CONF_SENSOR_NAME,
                        default=entry.data.get(CONF_SENSOR_NAME, ""),
                    ): str,
                    vol.Optional(
                        CONF_SCAN_INTERVAL,
                        default=entry.data.get(
                            CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL
                        ),
                    ): vol.All(int, vol.Range(min=60, max=3600)),
                }
            ),
            errors=errors,
        )
