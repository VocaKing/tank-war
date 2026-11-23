// Main menu: garage (3D preview), tank stats, map selection, comparison table
import { TANKS, TANK_BY_ID, SHELL_TYPES, TIER_NAMES, sanitizeLoadout } from '../game/tankData.js';
import { ITEMS, ITEM_IDS, ITEM_SLOTS, sanitizeItems, itemsKg, loadFactor, LOAD_AMPLIFY } from '../game/items.js';
import { describeTankAbilities } from '../game/abilities.js';
import { MAPS } from '../world/maps.js';

const los = (a) => Math.round(a[0] / Math.cos((a[1] * Math.PI) / 180));
const typeBadge = (type) => `<span class="ability-badge ${type}">${type === 'active' ? '主动' : '被动'}</span>`;

function tankCard(t) {
  const abilities = describeTankAbilities(t);
  return `<button class="tcard" data-id="${t.id}" aria-pressed="false">
    <b>${t.short}<em>${t.cls}</em></b><small>${t.nation} · ${t.year}</small>
    ${abilities.length ? `<span class="tank-ability-labels" lang="zh-CN">${abilities.map(({ type, name }) =>
      `<span class="tank-ability-label">${typeBadge(type)} ${name}</span>`).join('')}</span>` : ''}
  </button>`;
}

function skillDetails(tank, mobile) {
  const abilities = describeTankAbilities(tank);
  if (!abilities.length) return '';
  const activation = mobile ? '战斗中点「技能」' : '战斗中按 <kbd>G</kbd> 键';
  return `<h3>${mobile ? tank.short + ' · ' : ''}车辆技能</h3>
    <ul>${abilities.map(({ type, name, effect, timing }) => `
      <li class="${type}">
        <div class="ability-title">${typeBadge(type)} <strong>${name}</strong></div>
        <p>${effect}</p>
        <div class="ability-use">${type === 'active' ? activation : '自动生效'}${timing ? ' · ' + timing : ''}</div>
      </li>`).join('')}</ul>`;
}

export class Menu {
  constructor(root, garage, onStart, onBalance) {
    this.root = document.createElement('div'); this.root.className = 'menu'; root.appendChild(this.root);
    this.mobile = document.documentElement.classList.contains('mobile-device');
    this.garage = garage; this.onStart = onStart; this.onBalance = onBalance; this.tank = localStorage.getItem('tw_tank') || 'sherman'; this.map = localStorage.getItem('tw_map') || 'village'; this.quality = localStorage.getItem('tw_q') || 'high';
    if (!TANK_BY_ID[this.tank]) this.tank = 'sherman'; if (!MAPS.find((m) => m.id === this.map)) this.map = 'village';
    this.render(); this.select(this.tank);
  }
  render() {
    this.root.innerHTML = `
      <div class="brand"><h1>STEEL FRONT</h1><span>3D Tank War · v3.0</span></div>
      <div class="tanklist">${[1, 2, 3, 4].map((tier) => `<div class="tier">Tier ${['I', 'II', 'III', 'IV'][tier - 1]} · ${TIER_NAMES[tier] || ''}</div>` + TANKS.filter((t) => t.tier === tier).map(tankCard).join('')).join('')}</div>
      ${this.mobile ? '<section id="m-mobile-skills" class="vehicle-skills" lang="zh-CN" aria-label="车辆技能" hidden></section>' : ''}
      <button id="m-balance" class="balance-menu-btn" style="position:absolute;top:24px;right:24px;z-index:40;pointer-events:auto;padding:10px 16px;border:1px solid #8ca7bc;border-radius:6px;background:#263b4e;color:#fff;font:inherit;cursor:pointer">⚙ 游戏平衡编辑器 / Balance Editor</button>\n      <div class="menutools"><button class="tbl-btn" id="m-table">📊 Compare all tanks</button><button class="tbl-btn" id="m-armor">🛡️ Armor Preview</button></div>
      <div class="stats" id="m-stats"></div>
      <div class="bottom">
        <div class="go"><label>Graphics <select id="m-q"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label class="aa-opt" title="Hold the crosshair on a spotted enemy to soft-lock the camera on it; mouse input is dampened near the target, pull away firmly to break"><input type="checkbox" id="m-aa"> Aim assist (target lock + red outline)</label>
        <div class="mode">Team Battle · 7 vs 7 · Base capture · tier-matched</div><div class="losum" id="m-losum"></div><button class="tbl-btn lo-btn" id="m-lo-btn">🎒 Ammo &amp; equipment</button><button class="battle" id="m-battle">BATTLE!</button></div>
      </div>
      <button class="mobile-deploy" id="m-mobile-deploy" aria-label="进入战斗">进入战斗 · BATTLE</button>
      <div class="overlay" id="m-tbl"></div><div class="overlay" id="m-lo"></div><div class="overlay" id="m-maps"></div>`;
    this.root.querySelectorAll('.tcard').forEach((b) => (b.onclick = () => this.select(b.dataset.id)));
    this.root.querySelector('#m-battle').onclick = () => this.showMapSelect(true);
    this.root.querySelector('#m-mobile-deploy').onclick = () => this.showMapSelect(true);
    this.root.querySelector('#m-lo-btn').onclick = () => this.showLoadout(true);
    this.root.querySelector('#m-table').onclick = () => this.showTable(true);
    this.root.querySelector('#m-armor').onclick = () => this.toggleArmor();
    this.root.querySelector('#m-balance').onclick = () => this.onBalance();
    const q = this.root.querySelector('#m-q'); q.value = this.quality; q.onchange = () => { this.quality = q.value; localStorage.setItem('tw_q', q.value); };
    const aa = this.root.querySelector('#m-aa'); aa.checked = localStorage.getItem('tw_aa') !== '0'; aa.onchange = () => localStorage.setItem('tw_aa', aa.checked ? '1' : '0');
    this.selectMap(this.map);
  }
  toggleArmor() {
    this.armorOn = !this.armorOn;
    if (this.armorOn && !this.atkTank) this.atkTank = this.tank;
    this.refreshArmor();
  }
  atkShell() {
    const t = TANK_BY_ID[this.atkTank] || TANK_BY_ID[this.tank];
    if (!t) return null;
    const i = Math.min(this.atkShellIdx || 0, t.shells.length - 1);
    return t.shells[i];
  }
  refreshArmor() {
    const shell = this.atkShell();
    let info = { n: 0, pen: 0 };
    try { if (this.garage && this.garage.setArmorMode) info = this.garage.setArmorMode(this.armorOn, shell) || info; } catch (e) { console.warn('armor preview', e); }
    const btn = this.root.querySelector('#m-armor');
    if (btn) { btn.classList.toggle('sel', this.armorOn); btn.textContent = this.armorOn ? '🛡️ Armor Preview ON' : '🛡️ Armor Preview'; }
    let ban = this.root.querySelector('#m-armor-ban');
    if (this.armorOn) {
      if (!ban) { ban = document.createElement('div'); ban.id = 'm-armor-ban'; ban.className = 'armor-ban'; this.root.appendChild(ban); }
      const atk = TANK_BY_ID[this.atkTank] || TANK_BY_ID[this.tank];
      const tanks = TANKS.map((t) => `<option value="${t.id}" ${t.id === atk.id ? 'selected' : ''}>${t.short}</option>`).join('');
      const shells = atk.shells.map((s, i) => `<option value="${i}" ${i === (this.atkShellIdx || 0) ? 'selected' : ''}>${s.name} · ${s.type} · ${s.pen} mm</option>`).join('');
      ban.innerHTML = `<b>ARMOR PREVIEW</b> vs <select id="av-tank">${tanks}</select> <select id="av-shell">${shells}</select> <span class="lg g">will pen</span><span class="lg y">may pen</span><span class="lg r">no pen</span>`;
      ban.style.display = 'flex';
      ban.querySelector('#av-tank').onchange = (e) => { this.atkTank = e.target.value; this.atkShellIdx = 0; this.refreshArmor(); };
      ban.querySelector('#av-shell').onchange = (e) => { this.atkShellIdx = +e.target.value; this.refreshArmor(); };
    } else if (ban) ban.style.display = 'none';
  }
  showMapSelect(v) {
    const o = this.root.querySelector('#m-maps'); if (!v) { o.style.display = 'none'; return; }
    const draw = () => {
      o.innerHTML = `<div class="box mapbox"><h2>选择地图 / Select Map</h2>
        <div class="mapgrid">${MAPS.map((m) => `<button class="mcard ${m.id === this.map ? 'sel' : ''}" data-id="${m.id}"><b>${m.name}</b><small>${m.subtitle} · 1.2 × 1.2 km</small><p>${m.desc}</p></button>`).join('')}</div>
        <div class="mapacts"><button id="m-map-back">返回</button><button id="m-map-go" class="battle">确认出战 / Deploy</button></div></div>`;
      o.querySelectorAll('.mcard').forEach((b) => (b.onclick = () => { this.selectMap(b.dataset.id); draw(); }));
      o.querySelector('#m-map-back').onclick = () => this.showMapSelect(false);
      o.querySelector('#m-map-go').onclick = () => this.onStart({ tankId: this.tank, mapId: this.map, quality: this.quality, loadout: this.loadout(), items: this.items(), aimAssist: localStorage.getItem('tw_aa') !== '0' });
    };
    draw(); o.style.display = 'flex';
  }
  selectMap(id) { this.map = id; localStorage.setItem('tw_map', id); }
  select(id) {
    this.tank = id; localStorage.setItem('tw_tank', id); const t = TANK_BY_ID[id]; this.garage.show(t);
    this.root.querySelectorAll('.tcard').forEach((b) => {
      const selected = b.dataset.id === id;
      b.classList.toggle('sel', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
    this.summary();
    const skills = skillDetails(t, this.mobile);
    if (this.mobile) {
      const panel = this.root.querySelector('#m-mobile-skills');
      panel.hidden = !skills;
      panel.innerHTML = skills;
    }
    const bar = (label, v, max, unit = '', inv = false) => { const f = Math.max(0.04, Math.min(1, inv ? 1 - v / max + 0.15 : v / max)); return `<div class="bar"><span>${label}</span><div><i style="width:${f * 100}%"></i></div><b>${v}${unit}</b></div>`; };
    const sh = t.shells[0]; const a = t.armor;
    const stats = this.root.querySelector('#m-stats');
    stats.innerHTML = `<h2>${t.name}</h2><div class="tag">Tier ${['I', 'II', 'III', 'IV'][t.tier - 1]} ${t.cls} · ${t.nation} · ${t.era} · ${t.year} · crew ${t.crew.length}${t.autoloader ? ' (autoloader)' : ''}</div>
      ${!this.mobile && skills ? `<section class="vehicle-skills" lang="zh-CN" aria-label="车辆技能">${skills}</section>` : ''}
      <p>${t.desc}</p>
      ${bar('Hit points', t.hp, 2000)}${bar('Damage (AP)', sh.damage, 450)}${bar('Penetration', sh.pen, 760, ' mm')}${bar('Hull front (LOS)', los(a.hull.front), 700, ' mm')}${bar('Turret front (LOS)', los(a.turret.front), 950, ' mm')}
      ${bar('Top speed', t.maxSpeed, 72, ' km/h')}${bar('Reload', t.reload, 19, ' s', true)}${bar('Turret traverse', t.turretTraverse, 45, '°/s')}${bar('View range', t.viewRange, 520, ' m')}
      <table class="armor"><tr><th></th><th>Front</th><th>Side</th><th>Rear</th><th>Top</th></tr>
        <tr><td>Hull</td>${['front', 'side', 'rear', 'top'].map((k) => `<td>${a.hull[k][0]}<small>${a.hull[k][1] ? ' @' + a.hull[k][1] + '°' : ''}</small></td>`).join('')}</tr>
        <tr><td>Turret</td>${['front', 'side', 'rear', 'top'].map((k) => `<td>${a.turret[k][0]}<small>${a.turret[k][1] ? ' @' + a.turret[k][1] + '°' : ''}</small></td>`).join('')}</tr></table>
      <div class="shells">${t.shells.map((s, i) => `<div><b>${s.name}</b><small>${s.type} · ${s.caliber} mm · pen ${s.pen} mm · ${s.damage} dmg · ${s.velocity} m/s · ×${this.loadout(id)[i]}</small></div>`).join('')}<small>Stowage ${t.ammoCap} rounds</small></div>
      <div class="misc">${t.mass} t · ${t.power} hp (${(t.power / t.mass).toFixed(1)} hp/t) · reverse ${t.reverseSpeed} km/h · gun ${-t.gunDepression}°/+${t.gunElevation}° · aim ${t.aimTime}s · ${t.dims.L}×${t.dims.W} m${a.era ? ' · ERA +' + a.era + ' mm vs HEAT' : ''}</div>`;
    stats.scrollTop = 0;
  }
  loadout(id = this.tank) { let a = null; try { a = JSON.parse(localStorage.getItem('tw_lo_' + id)); } catch (e) { a = null; } return sanitizeLoadout(TANK_BY_ID[id], a); }
  items() { let a = null; try { a = JSON.parse(localStorage.getItem('tw_items')); } catch (e) { a = null; } return sanitizeItems(a); }
  summary() {
    const t = TANK_BY_ID[this.tank]; const lo = this.loadout(); const it = this.items(); const kg = itemsKg(it); const f = loadFactor(t.mass, kg);
    const el = this.root.querySelector('#m-losum'); if (el) el.innerHTML = `Ammo ${lo.join(' / ')} of ${t.ammoCap} · ${it.map((i) => ITEMS[i].icon + ' ' + ITEMS[i].name).join(', ') || 'no items'} · ${kg} kg → ${(t.maxSpeed * f).toFixed(1)} km/h`;
  }
  showLoadout(v) {
    const o = this.root.querySelector('#m-lo'); if (!v) { o.style.display = 'none'; this.summary(); return; }
    const t = TANK_BY_ID[this.tank]; let lo = this.loadout(); let it = this.items();
    const draw = () => {
      const sum = lo.reduce((a, b) => a + b, 0); const kg = itemsKg(it); const f = loadFactor(t.mass, kg);
      o.innerHTML = `<div class="box lo"><h2>${t.short} — ammunition &amp; equipment</h2>
        <h3>Ammunition <small>(fixed stowage: ${t.ammoCap} rounds — every round you add to one type is taken from another)</small></h3>
        ${t.shells.map((sh, i) => `<div class="lorow"><b>${i + 1}</b><div><b>${sh.name}</b> <small>${sh.type} · pen ${sh.pen} mm · ${sh.damage} dmg · ${sh.velocity} m/s</small><small class="role">${sh.role || ''}</small></div>
          <button data-a="${i}" data-d="-5">−5</button><button data-a="${i}" data-d="-1">−</button><input data-i="${i}" type="number" min="0" max="${t.ammoCap}" value="${lo[i]}"><button data-a="${i}" data-d="1">+</button><button data-a="${i}" data-d="5">+5</button></div>`).join('')}
        <div class="losum2 ${sum === t.ammoCap ? 'ok' : 'bad'}">Total ${sum} / ${t.ammoCap}</div>
        <h3>Equipment <small>(${ITEM_SLOTS} slots · keys 4 / 5 / 6 in battle · weight slows the tank)</small></h3>
        <div class="loitems">${[0, 1, 2].map((k) => `<label>Slot ${k + 4}<select data-s="${k}"><option value="">— empty —</option>${ITEM_IDS.map((id) => `<option value="${id}" ${it[k] === id ? 'selected' : ''} ${it.includes(id) && it[k] !== id ? 'disabled' : ''}>${ITEMS[id].icon} ${ITEMS[id].name} (${ITEMS[id].kg} kg)</option>`).join('')}</select><small>${it[k] ? ITEMS[it[k]].desc + (ITEMS[it[k]].passive ? '' : ` ${ITEMS[it[k]].charges}× · cooldown ${ITEMS[it[k]].cd} s`) : ''}</small></label>`).join('')}</div>
        <div class="loweight">Carried load <b>${kg} kg</b> on ${t.mass} t → top speed <b>${(t.maxSpeed * f).toFixed(1)} km/h</b> (−${((1 - f) * 100).toFixed(1)} %), acceleration −${((1 - f) * 100).toFixed(1)} % <small>(gear counts ×${LOAD_AMPLIFY} its mass: external stowage drag &amp; suspension load)</small></div>
        <div class="lobtns"><button id="lo-def">Reset to default</button><button id="lo-ok">Save &amp; close</button></div></div>`;
      o.querySelectorAll('button[data-a]').forEach((b) => (b.onclick = () => {
        // the total stays fixed: rounds added to one type are taken from the others (standard round first), and vice versa
        const i = +b.dataset.a; const order = [0, 1, 2].filter((x) => x !== i); let delta = Math.max(-lo[i], +b.dataset.d);
        if (delta > 0) { let need = delta; for (const k of order) { const take = Math.min(lo[k], need); lo[k] -= take; need -= take; } delta -= need; }
        else lo[order[0]] -= delta;
        lo[i] += delta; lo = sanitizeLoadout(t, lo); save(); draw(); }));
      o.querySelectorAll('input[data-i]').forEach((inp) => (inp.onchange = () => { const i = +inp.dataset.i; lo[i] = Math.max(0, Math.min(t.ammoCap, Math.floor(+inp.value || 0))); let over = lo.reduce((a, b) => a + b, 0) - t.ammoCap;
        for (const k of [0, 1, 2].filter((x) => x !== i)) { if (over <= 0) break; const d = Math.min(lo[k], over); lo[k] -= d; over -= d; } lo = sanitizeLoadout(t, lo); save(); draw(); }));
      o.querySelectorAll('select[data-s]').forEach((sel) => (sel.onchange = () => { const k = +sel.dataset.s; const arr = [it[0] || '', it[1] || '', it[2] || '']; arr[k] = sel.value; it = arr.filter(Boolean); localStorage.setItem('tw_items', JSON.stringify(it)); draw(); }));
      o.querySelector('#lo-def').onclick = () => { lo = t.defaultLoadout.slice(); it = sanitizeItems(null); localStorage.setItem('tw_items', JSON.stringify(it)); save(); draw(); };
      o.querySelector('#lo-ok').onclick = () => this.showLoadout(false);
    };
    const save = () => localStorage.setItem('tw_lo_' + t.id, JSON.stringify(lo));
    draw(); o.style.display = 'flex';
  }
  showTable(v) {
    const o = this.root.querySelector('#m-tbl'); if (!v) { o.style.display = 'none'; return; }
    const rows = [['Nation / era', (t) => `${t.nation} · ${t.era} (${t.year})`], ['Mass / power', (t) => `${t.mass} t · ${t.power} hp`], ['Hit points', (t) => t.hp], ['Main gun shell', (t) => t.shells[0].name], ['Damage (AP / alt / HE)', (t) => t.shells.map((s) => s.damage).join(' / ')], ['Penetration mm @100 m', (t) => t.shells.map((s) => s.pen).join(' / ')], ['Muzzle velocity m/s', (t) => t.shells.map((s) => s.velocity).join(' / ')],
      ['Hull armor F/S/R mm', (t) => ['front', 'side', 'rear'].map((k) => t.armor.hull[k][0] + (t.armor.hull[k][1] ? '@' + t.armor.hull[k][1] + '°' : '')).join(' / ')], ['Turret armor F/S/R mm', (t) => ['front', 'side', 'rear'].map((k) => t.armor.turret[k][0] + (t.armor.turret[k][1] ? '@' + t.armor.turret[k][1] + '°' : '')).join(' / ')],
      ['Effective hull front (LOS)', (t) => los(t.armor.hull.front) + ' mm'], ['Reload', (t) => t.reload + ' s'], ['Aim time / dispersion', (t) => `${t.aimTime} s / ${t.dispersion}–${t.maxDispersion} m @100 m`], ['Top speed fwd / rev', (t) => `${t.maxSpeed} / ${t.reverseSpeed} km/h`], ['Hull / turret traverse', (t) => `${t.hullTraverse} / ${t.turretTraverse} °/s`], ['Gun depression / elevation', (t) => `−${t.gunDepression}° / +${t.gunElevation}°`], ['View range', (t) => t.viewRange + ' m'], ['Crew', (t) => t.crew.length + (t.autoloader ? ' (autoloader)' : '')]];
    rows.unshift(['Tier / class', (t) => `${['I', 'II', 'III', 'IV'][t.tier - 1]} · ${t.cls}`]);
    o.innerHTML = `<div class="box wide"><h2>Tank comparison (${TANKS.length} tanks)</h2><div class="cmpwrap"><table class="cmp"><tr><th>Tank</th>${rows.map(([l]) => `<th>${l}</th>`).join('')}</tr>${TANKS.map((t) => `<tr class="${t.id === this.tank ? 'me' : ''}"><td><b>${t.short}</b></td>${rows.map(([, f]) => `<td>${f(t)}</td>`).join('')}</tr>`).join('')}</table></div>
      <p class="note">Penetration falls with range (AP −18%/km, APCR −35%/km, APFSDS −6%/km, HEAT constant). Effective armor = thickness ÷ cos(impact angle). Ricochet above ${SHELL_TYPES.APCBC.ricochet}° (AP), ${SHELL_TYPES.APDS.ricochet}° (APDS), ${SHELL_TYPES.APFSDS.ricochet}° (APFSDS); HEAT/HESH ignore ricochet but are stopped by ERA, composite (×HEAT multiplier) and spaced skirts. Penetration rolls ±${Math.round(8)}% unless the shell caliber overmatches the plate (3×).</p><button id="m-close">Close</button></div>`;
    o.style.display = 'flex'; o.querySelector('#m-close').onclick = () => this.showTable(false);
  }
  show(v) { this.root.style.display = v ? '' : 'none'; }
}
