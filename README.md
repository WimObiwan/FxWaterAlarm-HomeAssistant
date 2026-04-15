# WaterAlarm – Home Assistant Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)

Monitor your rainwater tank level directly in Home Assistant, with a beautiful animated gauge card.

<p align="center">
  <img src="docs/card-preview.png" alt="WaterAlarm card preview" width="320"/>
</p>

---

## Features

- **UI-based setup** — just paste your sensor URL, no YAML needed
- **Multiple sensors** — add as many tanks as you want
- **Animated tank card** — visual gauge with wave animation and colour thresholds
- **Sensors exposed** — water level (%), volume (L), battery voltage, sensor distance
- **Auto-discovery** of sensor names and tank capacity from the API
- **Dutch & English** translations

---

## Installation

### Option A — HACS (recommended)

1. Open HACS in Home Assistant
2. Go to **Integrations** → click the **⋮** menu (top right) → **Custom repositories**
3. Add this repository URL: `https://github.com/wimobiwan/FxWaterAlarm-HomeAssistant`  
   Category: **Integration**
4. Click **+ Explore & Download Repositories**, search for **WaterAlarm**, and install it
5. **Restart Home Assistant**

### Option B — Manual

1. Download the [latest release](https://github.com/wimobiwan/FxWaterAlarm-HomeAssistant/releases)
2. Copy the `custom_components/wateralarm/` folder into your Home Assistant `config/custom_components/` directory
3. **Restart Home Assistant**

---

## Setup

1. Go to **Settings** → **Devices & Services** → **+ Add Integration**
2. Search for **WaterAlarm**
3. Paste your sensor URL — you find it on your sensor page under **Details → API Link**  
   For example: `https://www.wateralarm.be/a/demo/s/f2y616afaEA`
4. Optionally give it a name (e.g. "Regenput achtertuin")
5. Click **Submit** — done!

To add more tanks, repeat these steps for each sensor URL.

> **Tip:** You don't need to convert the URL to an API URL. The integration accepts all formats:
> - `https://www.wateralarm.be/a/demo/s/abc123`
> - `https://www.wateralarm.be/api/a/demo/s/abc123`
> - `wateralarm.be/a/demo/s/abc123`

---

## Dashboard Card

After setup, the **WaterAlarm card** is automatically available in your Lovelace dashboard.

### Add via UI

1. Edit your dashboard → **+ Add Card**
2. Search for **WaterAlarm**
3. Select your level entity → Save

### Add via YAML

```yaml
type: custom:wateralarm-card
entity: sensor.wateralarm_regenput_water_level
```

### Full card options

```yaml
type: custom:wateralarm-card
entity: sensor.wateralarm_regenput_water_level
volume_entity: sensor.wateralarm_regenput_water_volume   # auto-detected
name: Regenput
show_volume: true           # default: true
show_last_update: true      # default: true
tank_color: "#2196F3"       # default: blue
```

### Card resource (YAML-mode dashboards only)

If you use YAML-mode Lovelace, add this to your `configuration.yaml`:

```yaml
lovelace:
  resources:
    - url: /wateralarm/wateralarm-card.js
      type: module
```

For storage-mode dashboards (the default), the resource is registered automatically.

---

## Entities

Each sensor creates the following entities:

| Entity | Unit | Description |
|---|---|---|
| Water level | % | Current fill percentage |
| Water volume | L | Current volume in litres |
| Battery voltage | V | Sensor battery (disabled by default) |
| Sensor distance | mm | Raw distance reading (disabled by default) |

The **Water level** entity also exposes extra attributes: `capacity_l`, `last_measurement`, and `sensor_name`.

---

## Troubleshooting

**"Cannot reach the WaterAlarm API"**  
Check that your Home Assistant instance has internet access and that the sensor URL is correct. Open the API URL in a browser to verify it returns JSON.

**Card not showing up**  
Go to **Settings → Dashboards → Resources** and verify that `/wateralarm/wateralarm-card.js` is listed. If not, add it manually as a JavaScript Module.

**Entities show "unavailable"**  
The sensor may not have sent a measurement yet. Check the WaterAlarm website for the latest reading. Battery and distance entities are disabled by default — enable them in entity settings if needed.

---

## Development

```bash
# Clone into your HA config directory
cd /config
git clone https://github.com/wimobiwan/FxWaterAlarm-HomeAssistant.git
ln -s FxWaterAlarm-HomeAssistant/custom_components/wateralarm custom_components/wateralarm
```

---

## License

MIT
