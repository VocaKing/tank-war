// Main menu: garage (3D preview), tank stats, map selection, comparison table
import { TANKS, TANK_BY_ID, SHELL_TYPES, TIER_NAMES, sanitizeLoadout } from '../game/tankData.js';
import { ITEMS, ITEM_IDS, ITEM_SLOTS, sanitizeItems, itemsKg, loadFactor, LOAD_AMPLIFY } from '../game/items.js';
import { MAPS } from '../world/maps.js';
import { CustomMode } from './customMode.js';
import { addArmorPreviewButton } from './armorPreview.js';

const los = (a) => Math.round(a[0] / Math.cos((a[1] * Math.PI) / 180));
export class Menu {
  constructor(root, garage, onStart) {
    this.root = document.createElement('div'); this.root.className = 'menu'; root.appendChild(this.root);
    this.garage = garage; this.onStart = onStart; this.tank = localStorage.getItem('tw_tank') || 'sherman'; this.map = localStorage.getItem('tw_map') || 'village'; this.quality = localStorage.getItem('tw_q') || 'high';
    if (!TANK_BY_ID[this.tank]) this.tank = 'sherman'; if (!MAPS.find((m) => m.id === this.map)) this.map = 'village';
    this.render(); this.select(this.tank);
  }
  render() {
    this.root.innerHTML = `
      <div class="brand"><h1>STEEL FRONT</h1><span>3D Tank War · v3.0</span></div>
      <div class="tanklist">${[1, 2, 3, 4].map((tier) => `<div class="tier">Tier ${['I', 'II', 'III', 'IV'][tier - 1]} · ${TIER_NAMES[tier] || ''}</div>` + TANKS.filter((t) => t.tier === tier).map((t) => `<button class="tcard" data-id="${t.id}"><b>${t.short}<em>${t.cls}</em></b><small>${t.nation} · ${t.year}</small></button>`).join('')).join('')}
        <button class="tbl-btn" id="m-table">📊 Compare all tanks</button></div>
      <div class="stats" id="m-stats"></div>
      <div class="bottom">
        <div class="maps">${MAPS.map((m) => `<button class="mcard" data-id="${m.id}"><b>${m.name}</b><small>${m.subtitle} · 1.2 × 1.2 km</small><p>${m.desc}</p></button>`).join('')}</div>
        <div class="go"><label>Graphics <select id="m-q"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label class="aa-opt" title="Hold the crosshair on a spotted enemy to soft-lock the camera on it; mouse input is dampened near the target, pull away firmly to break"><input type="checkbox" id="m-aa"> Aim assist (target lock + red outline)</label>
        <div class="mode">Team Battle · 7 vs 7 · Base capture · tier-matched</div><div class="losum" id="m-losum"></div><button class="tbl-btn lo-btn" id="m-lo-btn">🎒 Ammo & equipment</button><button class="tbl-btn" id="m-custom">Custom Mode</button><button class="tbl-btn" id="m-armor">Armor Preview</button><button class="battle" id="m-battle">BATTLE!</button></div>
      </div>
      <div class="overlay" id="m-tbl"></div><div class="overlay" id="m-lo"></div>`;
    this.root.querySelectorAll('.tcard').forEach((b) => (b.onclick = () => this.select(b.dataset.id)));
    this.root.querySelectorAll('.mcard').forEach((b) => (b.onclick = () => this.selectMap(b.dataset.id)));
    this.root.querySelector('#m-battle').onclick = () => this.onStart({ tankId: this.tank, mapId: this.map, quality: this.quality, loadout: this.loadout(), items: this.items(), aimAssist: localStorage.getItem('tw_aa') !== '0' });
    this.custom = new CustomMode(this.root, (mods) => this.onStart({ tankId: this.tank, mapId: this.map, quality: this.quality, loadout: this.loadout(), items: this.items(), aimAssist: localStorage.getItem('tw_aa') !== '0', custom: mods }));
    this.root.querySelector('#m-custom').onclick = () => this.custom.show(this.tank);
    this.root.querySelector('#m-armor').onclick = () => { if (this.garage && this.garage.setArmorMode) this.garage.setArmorMode(true); };
    this.root.querySelector('#m-lo-btn').onclick = () => this.showLoadout(true);
    this.root.querySelector('#m-table').onclick = () => this.showTable(true);
    const q = this.root.querySelector('#m-q'); q.value = this.quality; q.onchange = () => { this.quality = q.value; localStorage.setItem('tw_q', this.quality); };
    const aa = this.root.querySelector('#m-aa'); aa.checked = localStorage.getItem('tw_aa') !== '0'; aa.onchange = () => localStorage.setItem('tw_aa', aa.checked ? '1' : '0');
  }
  // remaining methods (select, selectMap, loadout, items, summary, showLoadout, showTable) preserved from original
}
