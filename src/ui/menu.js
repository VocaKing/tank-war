// Main menu: garage (3D preview), tank stats, map selection, comparison table
import { TANKS, TANK_BY_ID, SHELL_TYPES, TIER_NAMES, sanitizeLoadout } from '../game/tankData.js';
import { ITEMS, ITEM_IDS, ITEM_SLOTS, sanitizeItems, itemsKg, loadFactor, LOAD_AMPLIFY } from '../game/items.js';
import { MAPS } from '../world/maps.js';

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
        <div class="mode">Team Battle · 7 vs 7 · Base capture · tier-matched</div><div class="losum" id="m-losum"></div><button class="tbl-btn lo-btn" id="m-lo-btn">🎒 Ammo & equipment</button><button class="battle" id="m-battle">BATTLE!</button></div>
      </div>
      <div class="overlay" id="m-tbl"></div><div class="overlay" id="m-lo"></div>`;
    this.root.querySelectorAll('.tcard').forEach((b) => (b.onclick = () => this.select(b.dataset.id)));
    this.root.querySelectorAll('.mcard').forEach((b) => (b.onclick = () => this.selectMap(b.dataset.id)));
    this.root.querySelector('#m-battle').onclick = () => this.onStart({ tankId: this.tank, mapId: this.map, quality: this.quality, loadout: this.loadout(), items: this.items(), aimAssist: localStorage.getItem('tw_aa') !== '0' });
    this.root.querySelector('#m-lo-btn').onclick = () => this.showLoadout(true);
    this.root.querySelector('#m-table').onclick = () => this.showTable(true);
    const q = this.root.querySelector('#m-q'); q.value = this.quality; q.onchange = () => { this.quality = q.value; localStorage.setItem('tw_q', this.quality); };
    const aa = this.root.querySelector('#m-aa'); aa.checked = localStorage.getItem('tw_aa') !== '0'; aa.onchange = () => localStorage.setItem('tw_aa', aa.checked ? '1' : '0');
  }
  select(id) {
    this.tank = id; localStorage.setItem('tw_tank', id); const t = TANK_BY_ID[id];
    this.root.querySelectorAll('.tcard').forEach((b) => b.classList.toggle('sel', b.dataset.id === id));
    if (this.garage) this.garage.show(t);
    this.summary();
  }
  selectMap(id) { this.map = id; localStorage.setItem('tw_map', id); this.root.querySelectorAll('.mcard').forEach((b) => b.classList.toggle('sel', b.dataset.id === id)); }
  loadout() { return sanitizeLoadout(TANK_BY_ID[this.tank], JSON.parse(localStorage.getItem('tw_lo_' + this.tank) || 'null')); }
  items() { return sanitizeItems(JSON.parse(localStorage.getItem('tw_items') || 'null')); }
  summary() {
    const t = TANK_BY_ID[this.tank]; if (!t) return;
    const s = this.root.querySelector('#m-stats');
    s.innerHTML = `<h2>${t.name}</h2><div class="tag">Tier ${['I','II','III','IV'][t.tier-1]} ${t.cls} · ${t.nation} · ${t.era} · ${t.year} · crew ${t.crew.length}</div>
      <p>${t.desc}</p>
      <div class="bar"><span>Hit points</span><div><i style="width:${Math.min(100,t.hp/20)}%"></i></div><b>${t.hp}</b></div>
      <div class="bar"><span>Damage (AP)</span><div><i style="width:${Math.min(100,t.shells[0].damage/8)}%"></i></div><b>${t.shells[0].damage}</b></div>
      <div class="bar"><span>Penetration</span><div><i style="width:${Math.min(100,t.shells[0].pen/8)}%"></i></div><b>${t.shells[0].pen} mm</b></div>
      <div class="bar"><span>Hull front (LOS)</span><div><i style="width:${Math.min(100,los(t.armor.hull.front)/10)}%"></i></div><b>${los(t.armor.hull.front)} mm</b></div>
      <div class="bar"><span>Turret front (LOS)</span><div><i style="width:${Math.min(100,los(t.armor.turret.front)/10)}%"></i></div><b>${los(t.armor.turret.front)} mm</b></div>
      <div class="bar"><span>Top speed</span><div><i style="width:${Math.min(100,t.maxSpeed)}%"></i></div><b>${t.maxSpeed} km/h</b></div>
      <div class="bar"><span>Reload</span><div><i style="width:${Math.min(100,t.reload*8)}%"></i></div><b>${t.reload} s</b></div>
      <div class="bar"><span>Turret traverse</span><div><i style="width:${Math.min(100,t.turretTraverse*2)}%"></i></div><b>${t.turretTraverse}°/s</b></div>
      <div class="bar"><span>View range</span><div><i style="width:${Math.min(100,t.viewRange/6)}%"></i></div><b>${t.viewRange} m</b></div>
      <table class="armor"><tr><th></th><th>Front</th><th>Side</th><th>Rear</th><th>Top</th></tr>
        <tr><td>Hull</td>${['front','side','rear','top'].map((k)=>`<td>${t.armor.hull[k][0]}${t.armor.hull[k][1]?'@'+t.armor.hull[k][1]+'°':''}</td>`).join('')}</tr>
        <tr><td>Turret</td>${['front','side','rear','top'].map((k)=>`<td>${t.armor.turret[k][0]}${t.armor.turret[k][1]?'@'+t.armor.turret[k][1]+'°':''}</td>`).join('')}</tr></table>
      <div class="shells">${t.shells.map((s)=>`<div><b>${s.name}</b><small>${s.type} · ${s.caliber} mm · pen ${s.pen} mm · ${s.damage} dmg · ${s.velocity} m/s · ×${s.count}</small></div>`).join('')}</div>
      <div class="misc">${t.mass} t · ${t.power} hp (${(t.power/t.mass).toFixed(1)} hp/t) · reverse ${t.reverseSpeed} km/h · gun −${t.gunDepression}°/+${t.gunElevation}° · aim ${t.aimTime}s · ${t.dispersion}×3.75 m</div>`;
  }
  showLoadout(v) {
    const o = this.root.querySelector('#m-lo'); if (!v) { o.style.display = 'none'; return; }
    const t = TANK_BY_ID[this.tank]; let lo = this.loadout(); let it = this.items();
    const draw = () => {
      const kg = itemsKg(it); const lf = loadFactor(kg);
      o.innerHTML = `<div class="box"><h2>Ammo & equipment — ${t.short}</h2>
        <div class="lorow head"><span></span><span>Shell</span><span>Pen</span><span>Dmg</span><span>Count</span><span></span></div>
        ${t.shells.map((s,i)=>`<div class="lorow"><span></span><span>${s.name}<small>${s.type}</small></span><span>${s.pen}</span><span>${s.damage}</span>
          <span><button data-i="${i}" data-d="-1">−</button> <b id="c${i}">${lo[i]}</b> <button data-i="${i}" data-d="1">+</button></span><span></span></div>`).join('')}
        <h3>Equipment (3 slots, weight affects mobility)</h3>
        ${[0,1,2].map((k)=>`<div class="lorow"><span></span><span>Slot ${k+1}</span><span></span><span></span><select data-s="${k}">${['',...ITEM_IDS].map((id)=>`<option value="${id}" ${it[k]===id?'selected':''}>${id?ITEMS[id].name:'Empty'}</option>`).join('')}</select><span></span><span></span></div>`).join('')}
        <div class="misc">Load: ${kg.toFixed(0)} kg · mobility ×${(1-lf*LOAD_AMPLIFY).toFixed(2)} → ${(t.maxSpeed*(1-lf*LOAD_AMPLIFY)).toFixed(1)} km/h</div>
        <button id="lo-def">Default</button> <button id="lo-ok">OK</button></div>`;
      o.querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => { const i = +b.dataset.i; const d = +b.dataset.d; lo[i] = Math.max(0, Math.min(t.shells[i].count, lo[i] + d)); const over = lo.reduce((a,c)=>a+c,0) - t.shells.reduce((a,s)=>a+s.count,0); if (over > 0) { for (const k of [0,1,2].filter((x)=>x!==i)) { if (over <= 0) break; const dd = Math.min(lo[k], over); lo[k] -= dd; } } lo = sanitizeLoadout(t, lo); localStorage.setItem('tw_lo_'+t.id, JSON.stringify(lo)); draw(); }));
      o.querySelectorAll('select[data-s]').forEach((sel) => (sel.onchange = () => { const k = +sel.dataset.s; const arr = [it[0]||'', it[1]||'', it[2]||'']; arr[k] = sel.value; it = arr.filter(Boolean); localStorage.setItem('tw_items', JSON.stringify(it)); draw(); }));
      o.querySelector('#lo-def').onclick = () => { lo = t.defaultLoadout ? t.defaultLoadout.slice() : t.shells.map((s)=>s.count); it = sanitizeItems(null); localStorage.setItem('tw_items', JSON.stringify(it)); localStorage.setItem('tw_lo_'+t.id, JSON.stringify(lo)); draw(); };
      o.querySelector('#lo-ok').onclick = () => this.showLoadout(false);
    };
    draw(); o.style.display = 'flex';
  }
  showTable(v) {
    const o = this.root.querySelector('#m-tbl'); if (!v) { o.style.display = 'none'; return; }
    const rows = [['Nation / era', (t) => `${t.nation} · ${t.era} (${t.year})`], ['Mass / power', (t) => `${t.mass} t · ${t.power} hp`], ['Hit points', (t) => t.hp], ['Main gun shell', (t) => t.shells[0].name], ['Damage (AP / alt / HE)', (t) => t.shells.map((s) => s.damage).join(' / ')], ['Penetration mm @100 m', (t) => t.shells.map((s) => s.pen).join(' / ')], ['Muzzle velocity m/s', (t) => t.shells.map((s) => s.velocity).join(' / ')],
      ['Hull armor F/S/R mm', (t) => ['front', 'side', 'rear'].map((k) => t.armor.hull[k][0] + (t.armor.hull[k][1] ? '@' + t.armor.hull[k][1] + '°' : '')).join(' / ')], ['Turret armor F/S/R mm', (t) => ['front', 'side', 'rear'].map((k) => t.armor.turret[k][0] + (t.armor.turret[k][1] ? '@' + t.armor.turret[k][1] + '°' : '')).join(' / ')],
      ['Effective hull front (LOS)', (t) => los(t.armor.hull.front) + ' mm'], ['Reload', (t) => t.reload + ' s'], ['Aim time / dispersion', (t) => `${t.aimTime} s / ${t.dispersion} m @100 m`], ['Top speed fwd / rev', (t) => `${t.maxSpeed} / ${t.reverseSpeed} km/h`], ['Hull / turret traverse', (t) => `${t.hullTraverse} / ${t.turretTraverse} °/s`], ['Gun depression / elevation', (t) => `−${t.gunDepression}° / +${t.gunElevation}°`], ['View range', (t) => t.viewRange + ' m'], ['Crew', (t) => t.crew.length + (t.autoloader ? ' (autoloader)' : '')]];
    rows.unshift(['Tier / class', (t) => `${['I', 'II', 'III', 'IV'][t.tier - 1]} · ${t.cls}`]);
    o.innerHTML = `<div class="box wide"><h2>Tank comparison (${TANKS.length} tanks)</h2><div class="cmpwrap"><table class="cmp"><tr><th>Tank</th>${rows.map(([l]) => `<th>${l}</th>`).join('')}</tr>${TANKS.map((t) => `<tr class="${t.id === this.tank ? 'me' : ''}"><td><b>${t.short}</b></td>${rows.map(([, f]) => `<td>${f(t)}</td>`).join('')}</tr>`).join('')}</table></div>
      <p class="note">Penetration falls with range (AP −18%/km, APCR −35%/km, APFSDS −6%/km, HEAT constant). Effective armor = thickness ÷ cos(impact angle). Ricochet above ${SHELL_TYPES.APCBC.ricochet}° (AP), ${SHELL_TYPES.APDS.ricochet}° (APDS), ${SHELL_TYPES.APFSDS.ricochet}° (APFSDS); HEAT/HESH ignore ricochet but are stopped by ERA, composite (×HEAT multiplier) and spaced skirts. Penetration rolls ±${Math.round(8)}% unless the shell caliber overmatches the plate (3×).</p><button id="m-close">Close</button></div>`;
    o.style.display = 'flex'; o.querySelector('#m-close').onclick = () => this.showTable(false);
  }
  show(v) { this.root.style.display = v ? 'block' : 'none'; }
}
