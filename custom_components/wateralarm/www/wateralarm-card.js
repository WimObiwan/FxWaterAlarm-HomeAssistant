/**
 * WaterAlarm Card — custom Lovelace card for Home Assistant
 *
 * Shows a visual water-tank gauge with animated waves, volume readout,
 * and last-update timestamp.  Works with one or more WaterAlarm sensors.
 *
 * Minimal config:
 *   type: custom:wateralarm-card
 *   entity: sensor.wateralarm_regenput_water_level
 *
 * Full config:
 *   type: custom:wateralarm-card
 *   entity: sensor.wateralarm_regenput_water_level          # level %
 *   volume_entity: sensor.wateralarm_regenput_water_volume   # litres (optional, auto-detected)
 *   name: Regenput
 *   show_volume: true
 *   show_last_update: true
 *   tank_color: "#2196F3"
 */

const CARD_VERSION = (() => {
  try {
    const url = new URL(
      (document.currentScript && document.currentScript.src) ||
        import.meta.url
    );
    return url.searchParams.get("v") || "dev";
  } catch {
    return "dev";
  }
})();

class WaterAlarmCard extends HTMLElement {
  /* ──────────── lifecycle ──────────── */

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    // Build the DOM once, then update values in-place
    if (!this._built) {
      this._buildCard();
    }
    this._update();
  }

  setConfig(config) {
    if (!config.entity) throw new Error("Please define an entity");
    this._config = {
      show_volume: true,
      show_last_update: true,
      tank_color: "#2196F3",
      ...config,
    };
    // Try to guess volume entity from the level entity name
    if (!this._config.volume_entity) {
      this._config.volume_entity = this._config.entity.replace(
        "_water_level",
        "_water_volume"
      );
    }
    // Force full rebuild on config change
    this._built = false;
    if (this._hass) {
      this._buildCard();
      this._update();
    }
  }

  getCardSize() {
    return 4;
  }

  static getConfigElement() {
    return document.createElement("wateralarm-card-editor");
  }

  static getStubConfig(hass) {
    // Auto-find a WaterAlarm level entity
    const entity = Object.keys(hass.states).find(
      (e) => e.startsWith("sensor.wateralarm") && e.includes("_water_level")
    );
    return { entity: entity || "" };
  }

  /* ──────────── rendering ──────────── */

  _buildCard() {
    const color = this._config.tank_color;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          :host {
            --wa-color: ${color};
          }
          ha-card {
            padding: 16px;
            overflow: hidden;
          }
          .wa-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
          }
          .wa-name {
            font-size: 1.1em;
            font-weight: 500;
            color: var(--primary-text-color);
          }
          .wa-level-badge {
            font-size: 1.4em;
            font-weight: 700;
            color: var(--wa-color);
          }
          .wa-tank-wrap {
            position: relative;
            width: 100%;
            max-width: 240px;
            margin: 0 auto 12px;
            aspect-ratio: 3 / 4;
          }
          .wa-tank-svg {
            width: 100%;
            height: 100%;
          }
          @keyframes wave1 {
            0%   { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          @keyframes wave2 {
            0%   { transform: translateX(0); }
            100% { transform: translateX(50%); }
          }
          .wa-wave1 {
            animation: wave1 4s linear infinite;
          }
          .wa-wave2 {
            animation: wave2 5s linear infinite;
          }
          .wa-footer {
            text-align: center;
          }
          .wa-volume {
            font-size: 0.95em;
            font-weight: 500;
            color: var(--primary-text-color);
            margin-bottom: 4px;
          }
          .wa-updated {
            font-size: 0.78em;
            color: var(--secondary-text-color);
          }
          .wa-level-low  { --wa-color: #f44336; }
          .wa-level-med  { --wa-color: #ff9800; }
          .wa-level-ok   { --wa-color: ${color}; }
          .wa-level-high { --wa-color: #4caf50; }
        </style>

        <div class="wa-header">
          <span class="wa-name" data-wa="name"></span>
          <span class="wa-level-badge" data-wa="badge"></span>
        </div>

        <div class="wa-tank-wrap" data-wa="tank">
          <svg class="wa-tank-svg" viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <clipPath id="tankClip_${this._uid}">
                <rect x="20" y="20" width="160" height="220" rx="16"/>
              </clipPath>
              <linearGradient id="waterGrad_${this._uid}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--wa-color)" stop-opacity="0.7"/>
                <stop offset="100%" stop-color="var(--wa-color)" stop-opacity="0.95"/>
              </linearGradient>
            </defs>

            <rect x="20" y="20" width="160" height="220" rx="16"
                  fill="none" stroke="var(--divider-color, #e0e0e0)" stroke-width="3"/>

            <g clip-path="url(#tankClip_${this._uid})">
              <rect data-wa="fill" x="0" width="200" fill="url(#waterGrad_${this._uid})"/>
              <g class="wa-wave1">
                <path data-wa="wave1" fill="var(--wa-color)" opacity="0.35"/>
              </g>
              <g class="wa-wave2">
                <path data-wa="wave2" fill="var(--wa-color)" opacity="0.2"/>
              </g>
            </g>

            ${this._scaleTicks()}

            <text data-wa="pct" x="100"
                  text-anchor="middle" font-size="28" font-weight="700"
                  opacity="0.85"></text>
          </svg>
        </div>

        <div class="wa-footer">
          <div class="wa-volume" data-wa="volume"></div>
          <div class="wa-updated" data-wa="updated"></div>
        </div>
      </ha-card>
    `;
    this._built = true;

    // Cache references to updatable elements
    const q = (sel) => this.shadowRoot.querySelector(`[data-wa="${sel}"]`);
    this._els = {
      name: q("name"),
      badge: q("badge"),
      tank: q("tank"),
      fill: q("fill"),
      wave1: q("wave1"),
      wave2: q("wave2"),
      pct: q("pct"),
      volume: q("volume"),
      updated: q("updated"),
    };
  }

  _update() {
    const hass = this._hass;
    const config = this._config;
    const state = hass.states[config.entity];
    if (!state) {
      this._renderError("Entity not found: " + config.entity);
      return;
    }

    const level = parseFloat(state.state) || 0;
    const clampedLevel = Math.min(Math.max(level, 0), 110);
    const name =
      config.name ||
      state.attributes.friendly_name?.replace(/ Water level$/i, "") ||
      "WaterAlarm";
    const waveOffset = 100 - clampedLevel * 0.88;

    // Volume
    let volumeText = "";
    if (config.show_volume) {
      const volumeState = hass.states[config.volume_entity];
      if (volumeState && volumeState.state !== "unavailable") {
        const vol = parseFloat(volumeState.state);
        const cap = state.attributes.capacity_l;
        if (!isNaN(vol)) {
          volumeText = cap
            ? `${Math.round(vol).toLocaleString()} / ${Math.round(cap).toLocaleString()} L`
            : `${Math.round(vol).toLocaleString()} L`;
        }
      }
    }

    // Last update
    let lastUpdate = "";
    if (config.show_last_update && state.attributes.last_measurement) {
      try {
        lastUpdate = new Date(state.attributes.last_measurement).toLocaleString();
      } catch {
        lastUpdate = state.attributes.last_measurement;
      }
    }

    const e = this._els;

    // Update text
    e.name.textContent = name;
    e.badge.textContent = `${level.toFixed(1)}%`;

    // Update tank class (colour threshold)
    e.tank.className = `wa-tank-wrap ${this._levelClass(level)}`;

    // Update water fill position — SVG attributes, not full rebuild
    const yPct = `${waveOffset}%`;
    const hPct = `${100 - waveOffset + 5}%`;
    e.fill.setAttribute("y", yPct);
    e.fill.setAttribute("height", hPct);

    // Update wave paths
    e.wave1.setAttribute("d", this._wavePath(waveOffset, 6, 200));
    e.wave2.setAttribute("d", this._wavePath(waveOffset, 4, 200, 30));

    // Update percentage label
    e.pct.setAttribute("y", `${Math.max(waveOffset + 8, 28)}%`);
    e.pct.setAttribute("fill", level > 55 ? "#fff" : "var(--primary-text-color)");
    e.pct.textContent = `${Math.round(level)}%`;

    // Update footer
    e.volume.textContent = volumeText;
    e.volume.style.display = volumeText ? "" : "none";
    e.updated.textContent = lastUpdate ? `Last update: ${lastUpdate}` : "";
    e.updated.style.display = lastUpdate ? "" : "none";
  }

  /* ──────────── helpers ──────────── */

  get _uid() {
    if (!this.__uid)
      this.__uid = Math.random().toString(36).substring(2, 8);
    return this.__uid;
  }

  _levelClass(level) {
    if (level < 15) return "wa-level-low";
    if (level < 30) return "wa-level-med";
    if (level > 85) return "wa-level-high";
    return "wa-level-ok";
  }

  _wavePath(yPct, amplitude, width, phaseShift = 0) {
    // Generate a sine-wave path that tiles for the animation
    const y = (yPct / 100) * 260;
    const totalWidth = width * 2; // double width for seamless loop
    let d = `M0,${y}`;
    for (let x = 0; x <= totalWidth; x += 5) {
      const dy =
        Math.sin(((x + phaseShift) / width) * Math.PI * 2) * amplitude;
      d += ` L${x},${y + dy}`;
    }
    d += ` L${totalWidth},300 L0,300 Z`;
    return d;
  }

  _scaleTicks() {
    // Draw 25% / 50% / 75% tick marks on the right side of the tank
    return [25, 50, 75]
      .map((pct) => {
        const y = 20 + 220 * (1 - pct / 100);
        return `
        <line x1="160" y1="${y}" x2="180" y2="${y}"
              stroke="var(--secondary-text-color)" stroke-width="1" opacity="0.4"/>
        <text x="176" y="${y - 4}" font-size="9"
              fill="var(--secondary-text-color)" opacity="0.5"
              text-anchor="end">${pct}</text>
      `;
      })
      .join("");
  }

  _renderError(msg) {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <ha-card>
        <div style="padding:16px;color:var(--error-color,red)">${msg}</div>
      </ha-card>
    `;
  }
}

/* ── Visual Card Editor ── */

class WaterAlarmCardEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    const ep = this.shadowRoot?.getElementById("entity");
    if (ep) ep.hass = hass;
    const vp = this.shadowRoot?.getElementById("volume_entity");
    if (vp) vp.hass = hass;
  }

  setConfig(config) {
    this._config = { ...config };
    if (!this._rendered) {
      this._ensureEntityPickerLoaded().then(() => this._render());
    }
  }

  async _ensureEntityPickerLoaded() {
    if (customElements.get("ha-entity-picker")) return;
    // ha-entity-picker is lazy-loaded — force it by asking a built-in
    // card editor to load (its getConfigElement triggers the import).
    try {
      const helpers = await window.loadCardHelpers();
      const card = await helpers.createCardElement({ type: "entities", entities: [] });
      await card.constructor.getConfigElement();
    } catch (err) {
      console.warn("WaterAlarm: couldn't force-load ha-entity-picker", err);
    }
    // Wait for it to actually register (or give up after 3s)
    await Promise.race([
      customElements.whenDefined("ha-entity-picker"),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  }

  _render() {
    this._rendered = true;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        .row { margin-bottom: 16px; }
        .row-inline { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
        .row-inline label { font-weight:500; font-size:14px; flex:1; color:var(--primary-text-color); }
        .color-input { width:48px; height:32px; border:1px solid var(--divider-color,#ccc); border-radius:6px; padding:2px; cursor:pointer; background:none; }
      </style>
      <div>
        <div class="row"><ha-entity-picker id="entity" label="Water level entity" allow-custom-entity></ha-entity-picker></div>
        <div class="row"><ha-entity-picker id="volume_entity" label="Volume entity (optional)" allow-custom-entity></ha-entity-picker></div>
        <div class="row"><ha-textfield id="name" label="Name (optional)" placeholder="Auto-detected"></ha-textfield></div>
        <div class="row-inline"><label>Tank colour</label><input id="tank_color" type="color" class="color-input" value="${this._config.tank_color || "#2196F3"}"/></div>
      </div>
    `;

    requestAnimationFrame(() => {
      const ep = this.shadowRoot.getElementById("entity");
      const vp = this.shadowRoot.getElementById("volume_entity");
      const nm = this.shadowRoot.getElementById("name");

      ep.hass = this._hass;
      ep.value = this._config.entity || "";
      ep.addEventListener("value-changed", (e) => this._updateConfig("entity", e.detail.value));

      vp.hass = this._hass;
      vp.value = this._config.volume_entity || "";
      vp.addEventListener("value-changed", (e) => this._updateConfig("volume_entity", e.detail.value));

      nm.value = this._config.name || "";
      nm.addEventListener("change", (e) => this._updateConfig("name", e.target.value));
    });

    this.shadowRoot.getElementById("tank_color").addEventListener("input", (e) => {
      this._updateConfig("tank_color", e.target.value);
    });
  }

  _updateConfig(key, value) {
    this._config = { ...this._config, [key]: value };
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared: simple editor for cards that only need entity + name
   ═══════════════════════════════════════════════════════════════════════════ */

class WaterAlarmSimpleEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    const ep = this.shadowRoot?.getElementById("entity");
    if (ep) ep.hass = hass;
  }

  setConfig(config) {
    this._config = { ...config };
    if (!this._rendered) {
      this._ensureEntityPickerLoaded().then(() => this._render());
    }
  }

  async _ensureEntityPickerLoaded() {
    if (customElements.get("ha-entity-picker")) return;
    try {
      const helpers = await window.loadCardHelpers();
      const card = await helpers.createCardElement({ type: "entities", entities: [] });
      await card.constructor.getConfigElement();
    } catch (err) {
      console.warn("WaterAlarm: couldn't force-load ha-entity-picker", err);
    }
    await Promise.race([
      customElements.whenDefined("ha-entity-picker"),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  }

  _render() {
    this._rendered = true;
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        .row { margin-bottom: 16px; }
      </style>
      <div>
        <div class="row"><ha-entity-picker id="entity" label="Entity" allow-custom-entity></ha-entity-picker></div>
        <div class="row"><ha-textfield id="name" label="Name (optional)" placeholder="Auto-detected"></ha-textfield></div>
      </div>
    `;

    requestAnimationFrame(() => {
      const ep = this.shadowRoot.getElementById("entity");
      const nm = this.shadowRoot.getElementById("name");

      ep.hass = this._hass;
      ep.value = this._config.entity || "";
      ep.addEventListener("value-changed", (e) => this._updateConfig("entity", e.detail.value));

      nm.value = this._config.name || "";
      nm.addEventListener("change", (e) => this._updateConfig("name", e.target.value));
    });
  }

  _updateConfig(key, value) {
    this._config = { ...this._config, [key]: value };
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   Shared: _renderError and _getName helpers
   ═══════════════════════════════════════════════════════════════════════════ */

function _renderError(el, msg) {
  if (!el.shadowRoot) el.attachShadow({ mode: "open" });
  el.shadowRoot.innerHTML = `
    <ha-card>
      <div style="padding:16px;color:var(--error-color,red)">${msg}</div>
    </ha-card>
  `;
}

function _getName(config, state, suffix) {
  return (
    config.name ||
    state.attributes.friendly_name?.replace(new RegExp(` ${suffix}$`, "i"), "") ||
    "WaterAlarm"
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   Thermometer Card
   ═══════════════════════════════════════════════════════════════════════════ */

class WaterAlarmTempCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (!this._built) this._buildCard();
    this._update();
  }

  setConfig(config) {
    if (!config.entity) throw new Error("Please define an entity");
    this._config = { ...config };
    if (!this._config.humidity_entity) {
      this._config.humidity_entity = this._config.entity.replace("_temperature", "_humidity");
    }
    this._built = false;
    if (this._hass) { this._buildCard(); this._update(); }
  }

  getCardSize() { return 3; }

  static getConfigElement() {
    return document.createElement("wateralarm-simple-editor");
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass.states).find(
      (e) => e.startsWith("sensor.wateralarm") && e.includes("_temperature")
    );
    return { entity: entity || "" };
  }

  _buildCard() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          ha-card { padding: 16px; overflow: hidden; }
          .wa-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
          .wa-name { font-size:1.1em; font-weight:500; color:var(--primary-text-color); }
          .wa-badge { font-size:1.4em; font-weight:700; }
          .wa-body { display:flex; align-items:center; justify-content:center; gap:24px; padding:16px 0; }
          .wa-thermo { position:relative; width:60px; }
          .wa-thermo svg { width:100%; height:auto; }
          .wa-stats { display:flex; flex-direction:column; gap:12px; }
          .wa-stat-label { font-size:0.78em; color:var(--secondary-text-color); }
          .wa-stat-value { font-size:1.3em; font-weight:500; color:var(--primary-text-color); }
        </style>
        <div class="wa-header">
          <span class="wa-name" data-wa="name"></span>
          <span class="wa-badge" data-wa="badge" style="color:#e53935"></span>
        </div>
        <div class="wa-body">
          <div class="wa-thermo">
            <svg viewBox="0 0 60 160" xmlns="http://www.w3.org/2000/svg">
              <!-- tube -->
              <rect x="20" y="10" width="20" height="110" rx="10" fill="none" stroke="var(--divider-color,#e0e0e0)" stroke-width="2.5"/>
              <!-- bulb -->
              <circle cx="30" cy="130" r="18" fill="none" stroke="var(--divider-color,#e0e0e0)" stroke-width="2.5"/>
              <!-- mercury bulb (always filled) -->
              <circle cx="30" cy="130" r="14" data-wa="bulb" fill="#e53935"/>
              <!-- mercury column -->
              <rect data-wa="mercury" x="24" width="12" rx="6" fill="#e53935"/>
              <!-- scale ticks -->
              <line x1="42" y1="28" x2="48" y2="28" stroke="var(--secondary-text-color)" stroke-width="1" opacity="0.4"/>
              <text x="50" y="32" font-size="8" fill="var(--secondary-text-color)" opacity="0.5">40</text>
              <line x1="42" y1="55" x2="48" y2="55" stroke="var(--secondary-text-color)" stroke-width="1" opacity="0.4"/>
              <text x="50" y="59" font-size="8" fill="var(--secondary-text-color)" opacity="0.5">20</text>
              <line x1="42" y1="82" x2="48" y2="82" stroke="var(--secondary-text-color)" stroke-width="1" opacity="0.4"/>
              <text x="50" y="86" font-size="8" fill="var(--secondary-text-color)" opacity="0.5">0</text>
              <line x1="42" y1="109" x2="48" y2="109" stroke="var(--secondary-text-color)" stroke-width="1" opacity="0.4"/>
              <text x="50" y="113" font-size="8" fill="var(--secondary-text-color)" opacity="0.5">-20</text>
            </svg>
          </div>
          <div class="wa-stats">
            <div>
              <div class="wa-stat-label">Temperature</div>
              <div class="wa-stat-value" data-wa="temp">--</div>
            </div>
            <div>
              <div class="wa-stat-label">Humidity</div>
              <div class="wa-stat-value" data-wa="hum">--</div>
            </div>
          </div>
        </div>
      </ha-card>
    `;
    this._built = true;
    const q = (s) => this.shadowRoot.querySelector(`[data-wa="${s}"]`);
    this._els = { name: q("name"), badge: q("badge"), mercury: q("mercury"), bulb: q("bulb"), temp: q("temp"), hum: q("hum") };
  }

  _update() {
    const state = this._hass.states[this._config.entity];
    if (!state) { _renderError(this, "Entity not found: " + this._config.entity); return; }

    const temp = parseFloat(state.state);
    const name = _getName(this._config, state, "Temperature");
    const e = this._els;

    e.name.textContent = name;
    e.badge.textContent = isNaN(temp) ? "--" : `${temp.toFixed(1)}°C`;

    // Mercury: map -20°C..40°C to pixel range 109..28 (tube height)
    const clamped = Math.min(Math.max(isNaN(temp) ? 0 : temp, -20), 40);
    const topY = 109 - ((clamped + 20) / 60) * 81;
    const height = 120 - topY;
    e.mercury.setAttribute("y", topY);
    e.mercury.setAttribute("height", height);

    // Color: blue below 0, red above 25, orange in between
    const col = clamped < 0 ? "#1e88e5" : clamped > 25 ? "#e53935" : "#ff9800";
    e.mercury.setAttribute("fill", col);
    e.bulb.setAttribute("fill", col);
    e.badge.style.color = col;

    e.temp.textContent = isNaN(temp) ? "--" : `${temp.toFixed(1)} °C`;

    // Humidity
    const humState = this._hass.states[this._config.humidity_entity];
    if (humState && humState.state !== "unavailable") {
      e.hum.textContent = `${parseFloat(humState.state).toFixed(1)} %`;
    } else {
      e.hum.textContent = "--";
    }
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   Moisture Card
   ═══════════════════════════════════════════════════════════════════════════ */

class WaterAlarmMoistureCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (!this._built) this._buildCard();
    this._update();
  }

  setConfig(config) {
    if (!config.entity) throw new Error("Please define an entity");
    this._config = { ...config };
    if (!this._config.conductivity_entity) {
      this._config.conductivity_entity = this._config.entity.replace("_soil_moisture", "_soil_conductivity");
    }
    if (!this._config.soil_temp_entity) {
      this._config.soil_temp_entity = this._config.entity.replace("_soil_moisture", "_soil_temperature");
    }
    this._built = false;
    if (this._hass) { this._buildCard(); this._update(); }
  }

  getCardSize() { return 3; }

  static getConfigElement() {
    return document.createElement("wateralarm-simple-editor");
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass.states).find(
      (e) => e.startsWith("sensor.wateralarm") && e.includes("_soil_moisture")
    );
    return { entity: entity || "" };
  }

  get _uid() {
    if (!this.__uid) this.__uid = Math.random().toString(36).substring(2, 8);
    return this.__uid;
  }

  _buildCard() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          ha-card { padding: 16px; overflow: hidden; }
          .wa-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
          .wa-name { font-size:1.1em; font-weight:500; color:var(--primary-text-color); }
          .wa-badge { font-size:1.4em; font-weight:700; color:#4caf50; }
          .wa-body { display:flex; align-items:center; justify-content:center; gap:24px; padding:12px 0; }
          .wa-gauge { width:120px; height:120px; }
          .wa-stats { display:flex; flex-direction:column; gap:12px; }
          .wa-stat-label { font-size:0.78em; color:var(--secondary-text-color); }
          .wa-stat-value { font-size:1.1em; font-weight:500; color:var(--primary-text-color); }
        </style>
        <div class="wa-header">
          <span class="wa-name" data-wa="name"></span>
          <span class="wa-badge" data-wa="badge"></span>
        </div>
        <div class="wa-body">
          <div class="wa-gauge">
            <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
              <!-- background arc -->
              <circle cx="60" cy="60" r="50" fill="none"
                      stroke="var(--divider-color,#e0e0e0)" stroke-width="10"
                      stroke-dasharray="235.6 78.5"
                      stroke-dashoffset="-39.3"
                      stroke-linecap="round"/>
              <!-- value arc -->
              <circle data-wa="arc" cx="60" cy="60" r="50" fill="none"
                      stroke="#4caf50" stroke-width="10"
                      stroke-dasharray="0 314.2"
                      stroke-dashoffset="-39.3"
                      stroke-linecap="round"
                      style="transition:stroke-dasharray 0.5s ease"/>
              <!-- center text -->
              <text data-wa="pct" x="60" y="58" text-anchor="middle"
                    font-size="24" font-weight="700"
                    fill="var(--primary-text-color)">--%</text>
              <text x="60" y="76" text-anchor="middle"
                    font-size="11" fill="var(--secondary-text-color)">moisture</text>
            </svg>
          </div>
          <div class="wa-stats">
            <div>
              <div class="wa-stat-label">Soil temperature</div>
              <div class="wa-stat-value" data-wa="stemp">--</div>
            </div>
            <div>
              <div class="wa-stat-label">Conductivity</div>
              <div class="wa-stat-value" data-wa="cond">--</div>
            </div>
          </div>
        </div>
      </ha-card>
    `;
    this._built = true;
    const q = (s) => this.shadowRoot.querySelector(`[data-wa="${s}"]`);
    this._els = { name: q("name"), badge: q("badge"), arc: q("arc"), pct: q("pct"), stemp: q("stemp"), cond: q("cond") };
  }

  _update() {
    const state = this._hass.states[this._config.entity];
    if (!state) { _renderError(this, "Entity not found: " + this._config.entity); return; }

    const moisture = parseFloat(state.state);
    const name = _getName(this._config, state, "Soil moisture");
    const e = this._els;

    e.name.textContent = name;
    e.badge.textContent = isNaN(moisture) ? "--" : `${moisture.toFixed(1)}%`;

    // Arc: 0-100% maps to 0-235.6 of the 270° arc
    const pct = Math.min(Math.max(isNaN(moisture) ? 0 : moisture, 0), 100);
    const arcLen = (pct / 100) * 235.6;
    e.arc.setAttribute("stroke-dasharray", `${arcLen} 314.2`);

    // Color: brown(dry) → green(ok) → blue(wet)
    const col = pct < 20 ? "#a1887f" : pct < 60 ? "#4caf50" : "#1e88e5";
    e.arc.setAttribute("stroke", col);
    e.badge.style.color = col;

    e.pct.textContent = isNaN(moisture) ? "--%" : `${Math.round(moisture)}%`;

    // Soil temp
    const stState = this._hass.states[this._config.soil_temp_entity];
    e.stemp.textContent = (stState && stState.state !== "unavailable")
      ? `${parseFloat(stState.state).toFixed(1)} °C` : "--";

    // Conductivity
    const cState = this._hass.states[this._config.conductivity_entity];
    e.cond.textContent = (cState && cState.state !== "unavailable")
      ? `${Math.round(parseFloat(cState.state))} µS/cm` : "--";
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   Water Detection Card
   ═══════════════════════════════════════════════════════════════════════════ */

class WaterAlarmDetectCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    if (!this._built) this._buildCard();
    this._update();
  }

  setConfig(config) {
    if (!config.entity) throw new Error("Please define an entity");
    this._config = { ...config };
    this._built = false;
    if (this._hass) { this._buildCard(); this._update(); }
  }

  getCardSize() { return 2; }

  static getConfigElement() {
    return document.createElement("wateralarm-simple-editor");
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass.states).find(
      (e) => e.startsWith("binary_sensor.wateralarm") && e.includes("_water_detected")
    );
    return { entity: entity || "" };
  }

  _buildCard() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <ha-card>
        <style>
          ha-card { padding: 16px; overflow: hidden; }
          .wa-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
          .wa-name { font-size:1.1em; font-weight:500; color:var(--primary-text-color); }
          .wa-status-badge { font-size:1em; font-weight:700; padding:4px 12px; border-radius:12px; }
          .wa-body { display:flex; align-items:center; justify-content:center; padding:20px 0; }
          .wa-icon-wrap { width:80px; height:80px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:background 0.3s; }
          .wa-icon-wrap svg { width:40px; height:40px; }
        </style>
        <div class="wa-header">
          <span class="wa-name" data-wa="name"></span>
          <span class="wa-status-badge" data-wa="badge"></span>
        </div>
        <div class="wa-body">
          <div class="wa-icon-wrap" data-wa="icon-wrap">
            <svg data-wa="icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path data-wa="icon-path" fill="currentColor"/>
            </svg>
          </div>
        </div>
      </ha-card>
    `;
    this._built = true;
    const q = (s) => this.shadowRoot.querySelector(`[data-wa="${s}"]`);
    this._els = { name: q("name"), badge: q("badge"), iconWrap: q("icon-wrap"), iconPath: q("icon-path") };
  }

  _update() {
    const state = this._hass.states[this._config.entity];
    if (!state) { _renderError(this, "Entity not found: " + this._config.entity); return; }

    const isWet = state.state === "on";
    const name = _getName(this._config, state, "Water detected");
    const e = this._els;

    e.name.textContent = name;

    if (isWet) {
      e.badge.textContent = "Water detected";
      e.badge.style.background = "rgba(244,67,54,0.15)";
      e.badge.style.color = "#e53935";
      e.iconWrap.style.background = "rgba(244,67,54,0.12)";
      e.iconWrap.style.color = "#e53935";
      // mdi:water-alert
      e.iconPath.setAttribute("d", "M12,3C12,3 4,11.31 4,16A8,8 0 0,0 12,24C12.81,24 13.59,23.88 14.33,23.67L12.67,22C11.16,21.97 9.78,21.31 8.83,20.16C7.88,19 7.5,17.57 7.72,16.09L12,3M18,16C18,16 18,16.04 18,16.06L13.5,11.56L14.43,10.37L18,14.56C18,14.56 18,15.26 18,16M21.19,21.19L2.81,2.81L1.39,4.22L7.5,10.33C5.6,12.88 4,15.5 4,16A8,8 0 0,0 12,24C14.21,24 16.21,23.11 17.65,21.65L19.78,23.78L21.19,21.19Z");
    } else {
      e.badge.textContent = "Dry";
      e.badge.style.background = "rgba(76,175,80,0.15)";
      e.badge.style.color = "#4caf50";
      e.iconWrap.style.background = "rgba(76,175,80,0.12)";
      e.iconWrap.style.color = "#4caf50";
      // mdi:water-check
      e.iconPath.setAttribute("d", "M12,3.77L11.25,4.61C11.25,4.61 9.97,6.06 8.68,7.94C7.39,9.82 6,12.07 6,14.23A6,6 0 0,0 12,20.23A6,6 0 0,0 18,14.23C18,12.07 16.61,9.82 15.32,7.94C14.03,6.06 12.75,4.61 12.75,4.61L12,3.77M12,6.9C12.44,7.42 12.97,8.18 13.5,9.04C14.66,10.88 15.72,13.07 15.97,14.41L10.5,19.89C9.5,19.5 8.71,18.7 8.31,17.7L12.59,13.41L11.18,12L7.53,15.66C7.37,14.5 8.39,12.22 9.68,10.34C10.23,9.54 10.78,8.82 11.25,8.24C11.5,7.93 11.72,7.68 11.89,7.5L12,7.36L12,6.9Z");
    }
  }
}


/* ── Register ── */

if (!customElements.get("wateralarm-card")) {
  customElements.define("wateralarm-card", WaterAlarmCard);
}
if (!customElements.get("wateralarm-card-editor")) {
  customElements.define("wateralarm-card-editor", WaterAlarmCardEditor);
}
if (!customElements.get("wateralarm-simple-editor")) {
  customElements.define("wateralarm-simple-editor", WaterAlarmSimpleEditor);
}
if (!customElements.get("wateralarm-temp-card")) {
  customElements.define("wateralarm-temp-card", WaterAlarmTempCard);
}
if (!customElements.get("wateralarm-moisture-card")) {
  customElements.define("wateralarm-moisture-card", WaterAlarmMoistureCard);
}
if (!customElements.get("wateralarm-detect-card")) {
  customElements.define("wateralarm-detect-card", WaterAlarmDetectCard);
}

window.customCards = window.customCards || [];
window.customCards.push(
  {
    type: "wateralarm-card",
    name: "WaterAlarm Tank",
    description: "Water tank level gauge with animated waves",
    preview: true,
    documentationURL: "https://github.com/WimObiwan/FxWaterAlarm-HomeAssistant",
  },
  {
    type: "wateralarm-temp-card",
    name: "WaterAlarm Temperature",
    description: "Temperature and humidity display with thermometer",
    preview: true,
    documentationURL: "https://github.com/WimObiwan/FxWaterAlarm-HomeAssistant",
  },
  {
    type: "wateralarm-moisture-card",
    name: "WaterAlarm Soil Moisture",
    description: "Soil moisture gauge with conductivity and temperature",
    preview: true,
    documentationURL: "https://github.com/WimObiwan/FxWaterAlarm-HomeAssistant",
  },
  {
    type: "wateralarm-detect-card",
    name: "WaterAlarm Water Detection",
    description: "Water leak detection status indicator",
    preview: true,
    documentationURL: "https://github.com/WimObiwan/FxWaterAlarm-HomeAssistant",
  }
);

console.info(
  `%c WATERALARM-CARD %c v${CARD_VERSION} `,
  "background:#2196F3;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:700",
  "background:#555;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0"
);