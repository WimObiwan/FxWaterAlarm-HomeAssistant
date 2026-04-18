"""Binary sensor platform for WaterAlarm (Detect sensor type)."""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    CONF_SENSOR_NAME,
    DOMAIN,
    MANUFACTURER,
    MODEL_NAMES,
    SENSOR_TYPE_DETECT,
)
from .coordinator import WaterAlarmCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up WaterAlarm binary sensor entities."""
    coordinator: WaterAlarmCoordinator = hass.data[DOMAIN][entry.entry_id]
    sensor_type = WaterAlarmCoordinator.get_sensor_type(coordinator.data)

    if sensor_type != SENSOR_TYPE_DETECT:
        return

    name = entry.data.get(CONF_SENSOR_NAME, "WaterAlarm")
    async_add_entities([WaterAlarmDetectSensor(coordinator, entry, name)])


class WaterAlarmDetectSensor(
    CoordinatorEntity[WaterAlarmCoordinator], BinarySensorEntity
):
    """Binary sensor for WaterAlarm water detection."""

    _attr_has_entity_name = True
    _attr_device_class = BinarySensorDeviceClass.MOISTURE
    _attr_translation_key = "water_detected"

    def __init__(
        self,
        coordinator: WaterAlarmCoordinator,
        entry: ConfigEntry,
        name: str,
    ) -> None:
        """Initialise the binary sensor."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_water_detected"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": f"WaterAlarm {name}",
            "manufacturer": MANUFACTURER,
            "model": MODEL_NAMES.get(SENSOR_TYPE_DETECT, "Sensor"),
            "configuration_url": coordinator.api_url.replace("/api/", "/"),
        }

    @property
    def is_on(self) -> bool | None:
        """Return True if water is detected."""
        return WaterAlarmCoordinator.get_detect_status(self.coordinator.data)

    @property
    def available(self) -> bool:
        """Return True if entity is available."""
        return (
            super().available
            and WaterAlarmCoordinator.get_detect_status(self.coordinator.data)
            is not None
        )
