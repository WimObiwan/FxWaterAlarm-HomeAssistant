"""Sensor platform for WaterAlarm."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import PERCENTAGE, UnitOfVolume, UnitOfElectricPotential, UnitOfLength
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_SENSOR_NAME, DOMAIN, MANUFACTURER
from .coordinator import WaterAlarmCoordinator


@dataclass(frozen=True, kw_only=True)
class WaterAlarmSensorDescription(SensorEntityDescription):
    """Describe a WaterAlarm sensor."""

    value_fn: Callable[[dict[str, Any]], Any]
    available_fn: Callable[[dict[str, Any]], bool] = lambda d: d is not None


SENSOR_DESCRIPTIONS: tuple[WaterAlarmSensorDescription, ...] = (
    WaterAlarmSensorDescription(
        key="level",
        translation_key="level",
        native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:water-percent",
        suggested_display_precision=1,
        value_fn=WaterAlarmCoordinator.get_level_percent,
    ),
    WaterAlarmSensorDescription(
        key="volume",
        translation_key="volume",
        native_unit_of_measurement=UnitOfVolume.LITERS,
        device_class=SensorDeviceClass.VOLUME_STORAGE,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:water",
        suggested_display_precision=0,
        value_fn=WaterAlarmCoordinator.get_volume,
    ),
    WaterAlarmSensorDescription(
        key="battery",
        translation_key="battery",
        native_unit_of_measurement=UnitOfElectricPotential.VOLT,
        device_class=SensorDeviceClass.VOLTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:battery",
        entity_registry_enabled_default=False,
        suggested_display_precision=2,
        value_fn=WaterAlarmCoordinator.get_battery,
        available_fn=lambda d: WaterAlarmCoordinator.get_battery(d) is not None,
    ),
    WaterAlarmSensorDescription(
        key="distance",
        translation_key="distance",
        native_unit_of_measurement=UnitOfLength.MILLIMETERS,
        device_class=SensorDeviceClass.DISTANCE,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:ruler",
        entity_registry_enabled_default=False,
        suggested_display_precision=0,
        value_fn=WaterAlarmCoordinator.get_distance,
        available_fn=lambda d: WaterAlarmCoordinator.get_distance(d) is not None,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up WaterAlarm sensor entities."""
    coordinator: WaterAlarmCoordinator = hass.data[DOMAIN][entry.entry_id]
    name = entry.data.get(CONF_SENSOR_NAME, "WaterAlarm")

    entities = [
        WaterAlarmSensor(coordinator, entry, description, name)
        for description in SENSOR_DESCRIPTIONS
    ]
    async_add_entities(entities)


class WaterAlarmSensor(CoordinatorEntity[WaterAlarmCoordinator], SensorEntity):
    """Representation of a WaterAlarm sensor."""

    entity_description: WaterAlarmSensorDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: WaterAlarmCoordinator,
        entry: ConfigEntry,
        description: WaterAlarmSensorDescription,
        name: str,
    ) -> None:
        """Initialise the sensor."""
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": f"WaterAlarm {name}",
            "manufacturer": MANUFACTURER,
            "model": "Water Level Sensor",
            "configuration_url": coordinator.api_url.replace("/api/", "/"),
        }

    @property
    def native_value(self) -> Any:
        """Return the sensor value."""
        return self.entity_description.value_fn(self.coordinator.data)

    @property
    def available(self) -> bool:
        """Return True if entity is available."""
        return (
            super().available
            and self.entity_description.available_fn(self.coordinator.data)
        )

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        """Return extra attributes for the level sensor."""
        if self.entity_description.key != "level":
            return None
        data = self.coordinator.data
        if not data:
            return None
        attrs: dict[str, Any] = {}
        cap = WaterAlarmCoordinator.get_capacity(data)
        if cap is not None:
            attrs["capacity_l"] = cap
        ts = WaterAlarmCoordinator.get_last_update(data)
        if ts:
            attrs["last_measurement"] = ts
        api_name = WaterAlarmCoordinator.get_sensor_name(data)
        if api_name:
            attrs["sensor_name"] = api_name
        return attrs if attrs else None
