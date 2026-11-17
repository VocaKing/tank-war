// Main menu: garage (3D preview), tank stats, map selection, comparison table
import { TANKS, TANK_BY_ID, SHELL_TYPES, TIER_NAMES } from '../game/tankData.js';
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
      <div class="brand"><h1>STEEL FRONT</h1><span>3D Tank War · v2.0</span></div>
      <div class="tanklist">${[1, 2, 3, 4].map((tier) => `<div class="tier">Tier ${['I', 'II', 'III', 'IV'][tier - 1]} · ${TIER_NAMES[tier] || ''}</div>` + TANKS.filter((t) => t.tier === tier).map((t) => `<button class="tcard" data-id="${t.id}"><b>${t.short}<em>${t.cls}</em></b><small>${t.nation} · ${t.year}</small></button>`).join('')).join('')}
        <button class="tbl-btn" id="m-table">📊 Compare all tanks</button></div>
      <div class="stats" id="m-stats"></div>
      <div class="bottom">
        <div class="maps">${MAPS.map((m) => `<button class="mcard" data-id="${m.id}"><b>${m.name}</b><small>${m.subtitle} · 1.2 × 1.2 km</small><p>${m.desc}</p></button>`).join('')}</div>
        <div class="go"><label>Graphics <select id="m-q"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        <div class="mode">Team Battle · 7 vs 7 · Base capture · tier-matched</div><button class="battle" id="m-battle">BATTLE!</button></div>
      </div>
      <div class="overlay" id="m-tbl"></div>`;
    this.root.querySelectorAll('.tcard').forEach((b) => (b.onclick = () => this.select(b.dataset.id)));
    this.root.querySelectorAll('.mcard').forEach((b) => (b.onclick = () => this.selectMap(b.dataset.id)));
    this.root.querySelector('#m-battle').onclick = () => this.onStart({ tankId: this.tank, mapId: this.map, quality: this.quality });
    this.root.querySelector('#m-table').onclick = () => this.showTable(true);
    const q = this.root.querySelector('#m-q'); q.value = this.quality; q.onchange = () => { this.quality = q.value; localStorage.setItem('tw_q', q.value); };
    this.selectMap(this.map);
  }
  selectMap(id) { this.map = id; localStorage.setItem('tw_map', id); this.root.querySelectorAll('.mcard').forEach((b) => b.classList.toggle('sel', b.dataset.id === id)); }
  select(id) {
    this.tank = id; localStorage.setItem('tw_tank', id); const t = TANK_BY_ID[id]; this.garage.show(t);
    this.root.querySelectorAll('.tcard').forEach((b) => b.classList.toggle('sel', b.dataset.id === id));
    const bar = (label, v, max, unit = '', inv = false) => { const f = Math.max(0.04, Math.min(1, inv ? 1 - v / max + 0.15 : v / max)); return `<div class="bar"><span>${label}</span><div><i style="width:${f * 100}%"></i></div><b>${v}${unit}</b></div>`; };
    const sh = t.shells[0]; const a = t.armor;
    this.root.querySelector('#m-stats').innerHTML = `<h2>${t.name}</h2><div class="tag">Tier ${['I', 'II', 'III', 'IV'][t.tier - 1]} ${t.cls} · ${t.nation} · ${t.era} · ${t.year} · crew ${t.crew.length}${t.autoloader ? ' (autoloader)' : ''}</div><p>${t.desc}</p>
      ${bar('Hit points', t.hp, 2000)}${bar('Damage (AP)', sh.damage, 450)}${bar('Penetration', sh.pen, 760, ' mm')}${bar('Hull front (LOS)', los(a.hull.front), 700, ' mm')}${bar('Turret front (LOS)', los(a.turret.front), 950, ' mm')}
      ${bar('Top speed', t.maxSpeed, 72, ' km/h')}${bar('Reload', t.reload, 19, ' s', true)}${bar('Turret traverse', t.turretTraverse, 45, '°/s')}${bar('View range', t.viewRange, 520, ' m')}
      <table class="armor"><tr><th></th><th>Front</th><th>Side</th><th>Rear</th><th>Top</th></tr>
        <tr><td>Hull</td>${['front', 'side', 'rear', 'top'].map((k) => `<td>${a.hull[k][0]}<small>${a.hull[k][1] ? ' @' + a.hull[k][1] + '°' : ''}</small></td>`).join('')}</tr>
        <tr><td>Turret</td>${['front', 'side', 'rear', 'top'].map((k) => `<td>${a.turret[k][0]}<small>${a.turret[k][1] ? ' @' + a.turret[k][1] + '°' : ''}</small></td>`).join('')}</tr></table>
      <div class="shells">${t.shells.map((s) => `<div><b>${s.name}</b><small>${s.type} · ${s.caliber} mm · pen ${s.pen} mm · ${s.damage} dmg · ${s.velocity} m/s · ×${s.count}</small></div>`).join('')}</div>
      <div class="misc">${t.mass} t · ${t.power} hp (${(t.power / t.mass).toFixed(1)} hp/t) · reverse ${t.reverseSpeed} km/h · gun ${-t.gunDepression}°/+${t.gunElevation}° · aim ${t.aimTime}s · ${t.dims.L}×${t.dims.W} m${a.era ? ' · ERA +' + a.era + ' mm vs HEAT' : ''}</div>`;
  }
  showTable(v) {
    const o = this.root.querySelector('#m-tbl'); if (!v) { o.style.display = 'none'; return; }
    const rows = [['Nation / era', (t) => `${t.nation} · ${t.era} (${t.year})`], ['Mass / power', (t) => `${t.mass} t · ${t.power} hp`], ['Hit points', (t) => t.hp], ['Main gun shell', (t) => t.shells[0].name], ['Damage (AP / alt / HE)', (t) => t.shells.map((s) => s.damage).join(' / ')], ['Penetration mm @100 m', (t) => t.shells.map((s) => s.pen).join(' / ')], ['Muzzle velocity m/s', (t) => t.shells.map((s) => s.velocity).join(' / ')],
      ['Hull armor F/S/R mm', (t) => ['front', 'side', 'rear'].map((k) => t.armor.hull[k][0] + (t.armor.hull[k][1] ? '@' + t.armor.hull[k][1] + '°' : '')).join(' / ')], ['Turret armor F/S/R mm', (t) => ['front', 'side', 'rear'].map((k) => t.armor.turret[k][0] + (t.armor.turret[k][1] ? '@' + t.armor.turret[k][1] + '°' : '')).join(' / ')],
      ['Effective hull front (LOS)', (t) => los(t.armor.hull.front) + ' mm'], ['Reload', (t) => t.reload + ' s'], ['Aim time / dispersion', (t) => `${t.aimTime} s / ${t.dispersion} mrad`], ['Top speed fwd / rev', (t) => `${t.maxSpeed} / ${t.reverseSpeed} km/h`], ['Hull / turret traverse', (t) => `${t.hullTraverse} / ${t.turretTraverse} °/s`], ['Gun depression / elevation', (t) => `−${t.gunDepression}° / +${t.gunElevation}°`], ['View range', (t) => t.viewRange + ' m'], ['Crew', (t) => t.crew.length + (t.autoloader ? ' (autoloader)' : '')]];
    rows.unshift(['Tier / class', (t) => `${['I', 'II', 'III', 'IV'][t.tier - 1]} · ${t.cls}`]);
    o.innerHTML = `<div class="box wide"><h2>Tank comparison (${TANKS.length} tanks)</h2><div class="cmpwrap"><table class="cmp"><tr><th>Tank</th>${rows.map(([l]) => `<th>${l}</th>`).join('')}</tr>${TANKS.map((t) => `<tr class="${t.id === this.tank ? 'me' : ''}"><td><b>${t.short}</b></td>${rows.map(([, f]) => `<td>${f(t)}</td>`).join('')}</tr>`).join('')}</table></div>
      <p class="note">Penetration falls with range (AP −18%/km, APCR −35%/km, APFSDS −6%/km, HEAT constant). Effective armor = thickness ÷ cos(impact angle). Ricochet above ${SHELL_TYPES.APCBC.ricochet}° (AP), ${SHELL_TYPES.APDS.ricochet}° (APDS), ${SHELL_TYPES.APFSDS.ricochet}° (APFSDS); HEAT/HESH ignore ricochet but are stopped by ERA, composite (×HEAT multiplier) and spaced skirts. Penetration rolls ±${Math.round(8)}% unless the shell caliber overmatches the plate (3×).</p><button id="m-close">Close</button></div>`;
    o.style.display = 'flex'; o.querySelector('#m-close').onclick = () => this.showTable(false);
  }
  show(v) { this.root.style.display = v ? 'block' : 'none'; }
}
