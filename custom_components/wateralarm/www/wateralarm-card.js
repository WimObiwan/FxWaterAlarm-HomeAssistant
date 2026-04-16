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

/* ── Register ── */

if (!customElements.get("wateralarm-card")) {
  customElements.define("wateralarm-card", WaterAlarmCard);
}
if (!customElements.get("wateralarm-card-editor")) {
  customElements.define("wateralarm-card-editor", WaterAlarmCardEditor);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "wateralarm-card",
  name: "WaterAlarm",
  description: "Water tank level visualisation for WaterAlarm sensors",
  preview: true,
  documentationURL: "https://github.com/wateralarm/ha-wateralarm",
});

console.info(
  `%c WATERALARM-CARD %c v${CARD_VERSION} `,
  "background:#2196F3;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:700",
  "background:#555;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0"
);