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
from homeassistant.const import (
    PERCENTAGE,
    SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
    UnitOfElectricPotential,
    UnitOfLength,
    UnitOfTemperature,
    UnitOfVolume,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    CONF_SENSOR_NAME,
    DOMAIN,
    LEVEL_TYPES,
    MANUFACTURER,
    MODEL_NAMES,
    SENSOR_TYPE_DETECT,
    SENSOR_TYPE_MOISTURE,
    SENSOR_TYPE_THERMOMETER,
)
from .coordinator import WaterAlarmCoordinator


@dataclass(frozen=True, kw_only=True)
class WaterAlarmSensorDescription(SensorEntityDescription):
    """Describe a WaterAlarm sensor."""

    value_fn: Callable[[dict[str, Any]], Any]
    available_fn: Callable[[dict[str, Any]], bool] = lambda d: d is not None


# ── Shared descriptions (used by all sensor types) ──

_BATTERY_PCT = WaterAlarmSensorDescription(
    key="battery_pct",
    translation_key="battery_pct",
    native_unit_of_measurement=PERCENTAGE,
    device_class=SensorDeviceClass.BATTERY,
    state_class=SensorStateClass.MEASUREMENT,
    icon="mdi:battery",
    suggested_display_precision=0,
    value_fn=WaterAlarmCoordinator.get_battery_pct,
    available_fn=lambda d: WaterAlarmCoordinator.get_battery_pct(d) is not None,
)

_BATTERY_VOLTAGE = WaterAlarmSensorDescription(
    key="battery_voltage",
    translation_key="battery_voltage",
    native_unit_of_measurement=UnitOfElectricPotential.VOLT,
    device_class=SensorDeviceClass.VOLTAGE,
    state_class=SensorStateClass.MEASUREMENT,
    icon="mdi:battery",
    entity_registry_enabled_default=False,
    suggested_display_precision=2,
    value_fn=WaterAlarmCoordinator.get_battery,
    available_fn=lambda d: WaterAlarmCoordinator.get_battery(d) is not None,
)

_RSSI = WaterAlarmSensorDescription(
    key="rssi",
    translation_key="rssi",
    native_unit_of_measurement=SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
    device_class=SensorDeviceClass.SIGNAL_STRENGTH,
    state_class=SensorStateClass.MEASUREMENT,
    icon="mdi:signal",
    entity_registry_enabled_default=False,
    suggested_display_precision=0,
    value_fn=WaterAlarmCoordinator.get_rssi,
    available_fn=lambda d: WaterAlarmCoordinator.get_rssi(d) is not None,
)

_SHARED = (_BATTERY_PCT, _BATTERY_VOLTAGE, _RSSI)

# ── Level / LevelPressure ──

_LEVEL_DESCRIPTIONS: tuple[WaterAlarmSensorDescription, ...] = (
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
    *_SHARED,
)

# ── Detect — sensor entities (battery only; binary_sensor handles status) ──

_DETECT_DESCRIPTIONS: tuple[WaterAlarmSensorDescription, ...] = (
    *_SHARED,
)

# ── Thermometer ──

_THERMOMETER_DESCRIPTIONS: tuple[WaterAlarmSensorDescription, ...] = (
    WaterAlarmSensorDescription(
        key="temperature",
        translation_key="temperature",
        native_unit_of_measurement=UnitOfTemperature.CELSIUS,
        device_class=SensorDeviceClass.TEMPERATURE,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:thermometer",
        suggested_display_precision=1,
        value_fn=WaterAlarmCoordinator.get_temperature,
    ),
    WaterAlarmSensorDescription(
        key="humidity",
        translation_key="humidity",
        native_unit_of_measurement=PERCENTAGE,
        device_class=SensorDeviceClass.HUMIDITY,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:water-percent",
        suggested_display_precision=1,
        value_fn=WaterAlarmCoordinator.get_humidity,
    ),
    *_SHARED,
)

# ── Moisture ──

_MOISTURE_DESCRIPTIONS: tuple[WaterAlarmSensorDescription, ...] = (
    WaterAlarmSensorDescription(
        key="soil_moisture",
        translation_key="soil_moisture",
        native_unit_of_measurement=PERCENTAGE,
        device_class=SensorDeviceClass.MOISTURE,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:water-percent",
        suggested_display_precision=1,
        value_fn=WaterAlarmCoordinator.get_soil_moisture,
    ),
    WaterAlarmSensorDescription(
        key="soil_conductivity",
        translation_key="soil_conductivity",
        native_unit_of_measurement="µS/cm",
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:flash",
        suggested_display_precision=0,
        value_fn=WaterAlarmCoordinator.get_soil_conductivity,
    ),
    WaterAlarmSensorDescription(
        key="soil_temperature",
        translation_key="soil_temperature",
        native_unit_of_measurement=UnitOfTemperature.CELSIUS,
        device_class=SensorDeviceClass.TEMPERATURE,
        state_class=SensorStateClass.MEASUREMENT,
        icon="mdi:thermometer",
        suggested_display_precision=1,
        value_fn=WaterAlarmCoordinator.get_soil_temperature,
    ),
    *_SHARED,
)

# ── Map sensor type → descriptions ──

SENSOR_MAP: dict[str, tuple[WaterAlarmSensorDescription, ...]] = {
    SENSOR_TYPE_DETECT: _DETECT_DESCRIPTIONS,
    SENSOR_TYPE_MOISTURE: _MOISTURE_DESCRIPTIONS,
    SENSOR_TYPE_THERMOMETER: _THERMOMETER_DESCRIPTIONS,
}


def _get_descriptions(
    sensor_type: str,
) -> tuple[WaterAlarmSensorDescription, ...]:
    """Return the sensor descriptions for a given sensor type."""
    if sensor_type in LEVEL_TYPES:
        return _LEVEL_DESCRIPTIONS
    return SENSOR_MAP.get(sensor_type, _LEVEL_DESCRIPTIONS)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up WaterAlarm sensor entities."""
    coordinator: WaterAlarmCoordinator = hass.data[DOMAIN][entry.entry_id]
    name = entry.data.get(CONF_SENSOR_NAME, "WaterAlarm")
    sensor_type = WaterAlarmCoordinator.get_sensor_type(coordinator.data)

    descriptions = _get_descriptions(sensor_type)
    entities = [
        WaterAlarmSensor(coordinator, entry, description, name, sensor_type)
        for description in descriptions
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
        sensor_type: str,
    ) -> None:
        """Initialise the sensor."""
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": f"WaterAlarm {name}",
            "manufacturer": MANUFACTURER,
            "model": MODEL_NAMES.get(sensor_type, "Sensor"),
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
