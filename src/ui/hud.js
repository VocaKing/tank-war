// In-game HUD (DOM overlay)
import * as THREE from 'three';
import { TANKS } from '../game/tankData.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class HUD {
  constructor(root, game) {
    this.g = game; this.root = el('div', 'hud'); root.appendChild(this.root);
    this.root.innerHTML = `
      <div class="top"><div class="teams"><div class="tcount ally" id="h-ally"></div><div class="timer" id="h-timer">15:00</div><div class="tcount enemy" id="h-enemy"></div></div>
        <div class="caps"><div class="cap ally"><span>Allied base</span><div class="bar"><i id="h-cap0"></i></div></div><div class="cap enemy"><span>Enemy base</span><div class="bar"><i id="h-cap1"></i></div></div></div></div>
      <div class="killfeed" id="h-feed"></div>
      <div class="markers" id="h-markers"></div>
      <div class="scope" id="h-scope"><div class="scope-ring"></div><div class="mil"></div><div class="ticks"></div><div class="zoom" id="h-zoom">x4</div><div class="avhint" id="h-av"></div></div>
      <div class="cross" id="h-cross"></div>
      <div class="assist" id="h-assist"></div>
      <div class="reticle" id="h-ret"><div class="ring"></div><div class="dot"></div><div class="lockbr"></div><div class="pen" id="h-pen"></div></div>
      <div class="msgs" id="h-msgs"></div>
      <div class="dmgdir" id="h-dmgdir"></div>
      <div class="status" id="h-status"></div>
      <div class="spotted" id="h-spotted">⚠ SPOTTED</div>
      <div class="panel left" id="h-veh"></div>
      <div class="panel items" id="h-items"></div>
      <div class="panel ammo" id="h-ammo"></div>
      <div class="panel map"><canvas id="h-mini" width="260" height="260"></canvas></div>
      <div class="help" id="h-help"><b>Controls</b><br>W/S throttle · A/D steer · Mouse aim · LMB fire<br>RMB / Shift sniper · Wheel zoom ×2/×4/×8/×16 · 1/2/3 ammo<br>X armor view (sniper) · E gun lock · aim assist: hold the crosshair on an enemy to soft-lock, pull away to break<br>4/5/6 equipment (R repair · F extinguisher) · Tab scores · Esc menu<br><i>Bushes add camouflage – firing reduces it; anyone within 50 m sees you.</i></div>
      <div class="overlay" id="h-board"></div>
      <div class="overlay" id="h-pause"><div class="box"><h2>Paused</h2><button id="h-resume">Resume</button><button id="h-aa"></button><button id="h-quit">Quit to menu</button></div></div>
      <div class="overlay" id="h-end"></div>`;
    this.$ = (id) => this.root.querySelector('#' + id);
    this.mini = this.$('h-mini').getContext('2d'); this.markerPool = []; this.msgTimer = 0; this.feed = [];
    this.$('h-resume').onclick = () => game.setPaused(false);
    const aa = this.$('h-aa'); const aaTxt = () => { aa.textContent = 'Aim assist: ' + (game.assist.enabled ? 'ON' : 'OFF'); }; aaTxt();
    aa.onclick = () => { game.assist.setEnabled(!game.assist.enabled); try { localStorage.setItem('tw_aa', game.assist.enabled ? '1' : '0'); } catch (e) { /* private mode */ } aaTxt(); }; this.$('h-quit').onclick = () => game.exit();
    setTimeout(() => this.$('h-help').classList.add('fade'), 14000);
    this.buildMiniBase(); this.miniT = 0;
  }
  buildMiniBase() {
    const W = this.g.world; const T = W.terrain; const S = 260; const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    const img = g.createImageData(S, S); const half = W.playHalf; const def = W.def;
    const base = def.id === 'desert' ? [196, 170, 128] : def.id === 'forest' ? [92, 108, 70] : [118, 138, 84];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = -half + (x + 0.5) / S * 2 * half, wz = -half + (y + 0.5) / S * 2 * half; const h = T.height(wx, wz); const hx = T.height(wx + 4, wz) - h; const shade = 1 + hx * 0.12 + (h - 20) * 0.004;
      let col = base.slice(); const i = T.x2i(wx), j = T.x2i(wz); const k = T.idx(i, j);
      if (T.road[k] > 0.5) col = [150, 136, 112]; if (T.water[k] > -1e8 && T.water[k] > h) col = [70, 100, 120];
      const o = (y * S + x) * 4; img.data[o] = col[0] * shade; img.data[o + 1] = col[1] * shade; img.data[o + 2] = col[2] * shade; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const toM = (x, z) => [(x + half) / (2 * half) * S, (z + half) / (2 * half) * S];
    g.fillStyle = def.id === 'desert' ? 'rgba(90,110,60,0.55)' : 'rgba(30,60,25,0.45)'; for (const t of W.veg.trees) { const [mx, my] = toM(t.x, t.z); g.fillRect(mx - 0.8, my - 0.8, 1.6, 1.6); }
    g.fillStyle = 'rgba(40,80,30,0.7)'; for (const b of W.veg.bushes) { const [mx, my] = toM(b.x, b.z); g.beginPath(); g.arc(mx, my, 1.2, 0, 6.3); g.fill(); }
    g.fillStyle = 'rgba(60,55,50,0.9)';
    for (const c2 of W.colliders) { if (c2.kind === 'prop') continue; g.save(); const [mx, my] = toM(c2.x, c2.z); g.translate(mx, my); g.rotate(-c2.rot); const sx = c2.hx / half * S / 2, sz = c2.hz / half * S / 2; g.fillRect(-sx, -sz, sx * 2, sz * 2); g.restore(); }
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(i * S / 10, 0); g.lineTo(i * S / 10, S); g.stroke(); g.beginPath(); g.moveTo(0, i * S / 10); g.lineTo(S, i * S / 10); g.stroke(); }
    W.bases.forEach((b, i) => { const [mx, my] = toM(b.x, b.z); g.strokeStyle = i === 0 ? '#5fd36f' : '#ff5a4a'; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, b.r / half * S / 2, 0, 6.3); g.stroke(); });
    this.miniBase = c; this.toM = toM;
  }
  drawMini() {
    const g = this.mini, G = this.g; g.drawImage(this.miniBase, 0, 0); const S = 260; const half = G.world.playHalf;
    const p = G.player; const [px, py] = this.toM(p.pos.x, p.pos.z);
    // view range circle & camera direction
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(px, py, p.viewRange / half * S / 2, 0, 6.3); g.stroke();
    const cy = G.cam.yaw; g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(px, py); g.arc(px, py, 40, Math.PI / 2 - cy - 0.4, Math.PI / 2 - cy + 0.4, false); g.closePath(); g.fill();
    for (const t of G.tanks) {
      if (t === p && t.alive) continue;
      const ally = t.team === p.team; const vis = ally || t.spotted[p.team] || !t.alive;
      let pos = t.pos; let alpha = 1;
      if (!vis) { const lp = t.lastSeenPos[p.team]; if (!lp || G.time - (t.lastSeenTime || 0) > 20) continue; pos = lp; alpha = 0.35; }
      const [mx, my] = this.toM(pos.x, pos.z);
      g.save(); g.translate(mx, my); g.rotate(-t.heading + Math.PI); g.globalAlpha = alpha;
      g.fillStyle = !t.alive ? '#555' : ally ? '#6fe37f' : '#ff4a3a'; g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill(); g.stroke(); g.restore();
      if (!t.alive) { g.strokeStyle = '#222'; g.beginPath(); g.moveTo(mx - 3, my - 3); g.lineTo(mx + 3, my + 3); g.moveTo(mx + 3, my - 3); g.lineTo(mx - 3, my + 3); g.stroke(); }
    }
    if (p.alive) { g.save(); g.translate(px, py); g.rotate(-p.heading + Math.PI); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.beginPath(); g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6); g.closePath(); g.fill(); g.stroke(); g.restore(); }
  }
  message(text, color = '#fff', big = false) {
    const m = el('div', 'msg' + (big ? ' big' : ''), text); m.style.color = color; this.$('h-msgs').appendChild(m); setTimeout(() => m.remove(), big ? 3500 : 2600);
    while (this.$('h-msgs').children.length > 5) this.$('h-msgs').firstChild.remove();
  }
  hitMarker(kind, dmg = 0, msgs = [], tank) {
    const T = { pen: ['PENETRATION', '#ffd34d'], ricochet: ['RICOCHET', '#9ab'], nonpen: ['NOT PENETRATED', '#aaa'], blast: ['HE BLAST', '#ffb060'], splash: ['SPLASH', '#ffb060'] }[kind];
    this.message(`${T[0]}${dmg ? ' −' + dmg : ''}${msgs && msgs.length ? '<small>' + msgs.join(' · ') + '</small>' : ''}`, T[1], kind === 'pen');
    void tank;
  }
  damageFrom(src, dmg, text) {
    if (dmg) this.message(`HIT −${dmg} ${text ? '<small>' + text + '</small>' : ''}`, '#ff6050'); else if (text) this.message(text, '#ccc');
    if (src) { this.dmgSrc = src.pos.clone(); this.dmgT = 2.5; }
    this.$('h-veh').classList.add('flash'); setTimeout(() => this.$('h-veh').classList.remove('flash'), 300);
  }
  kill(attacker, victim, cause) {
    const c = (t) => (t ? `<span class="${t.team === this.g.player.team ? 'a' : 'e'}">${t.name} <small>${t.spec.short}</small></span>` : '?');
    const f = el('div', 'kf', `${c(attacker)} <b>${cause === 'ammo' ? '💥' : '✖'}</b> ${c(victim)}`); this.$('h-feed').prepend(f); setTimeout(() => f.remove(), 12000);
    if (attacker && attacker.isPlayer) this.message('ENEMY DESTROYED', '#ffd34d', true);
    if (victim.isPlayer) this.message('YOU WERE DESTROYED — spectating allies (Esc for menu)', '#ff6050', true);
  }
  updateMarkers(camera) {
    const G = this.g; const W = innerWidth, H = innerHeight; let n = 0; const v = new THREE.Vector3();
    for (const t of G.tanks) {
      if (t === G.player && t.alive) continue; if (!t.alive) continue;
      const ally = t.team === G.player.team; if (!ally && !t.spotted[G.player.team]) continue;
      v.copy(t.pos); v.y += t.spec.dims.hullH + t.spec.dims.turretH + 1.6; const d = camera.position.distanceTo(v); if (ally && d > 500) continue;
      v.project(camera); if (v.z > 1 || v.z < -1) continue; const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H; if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) continue;
      let m = this.markerPool[n]; if (!m) { m = el('div', 'mk', '<div class="nm"></div><div class="rl"><i></i></div><div class="hp"><i></i></div><div class="ar">▼</div>'); this.$('h-markers').appendChild(m); this.markerPool.push(m); }
      m.style.display = 'block'; m.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`; m.className = 'mk ' + (ally ? 'a' : 'e');
      m.children[0].textContent = `${t.spec.short}${d < 700 ? ' · ' + Math.round(d) + 'm' : ''}`;
      const rl = m.children[1];
      if (ally && t.alive && t.reloadLeft > 0) { rl.style.display = 'block'; rl.firstChild.style.width = ((1 - t.reloadLeft / t.reloadTime()) * 100) + '%'; }
      else rl.style.display = 'none';
      m.children[2].firstChild.style.width = (t.hp / t.maxHp * 100) + '%'; n++;
    }
    for (let i = n; i < this.markerPool.length; i++) this.markerPool[i].style.display = 'none';
  }
  update(dt, camera) {
    const G = this.g, p = G.player;
    const alive = (team) => G.tanks.filter((t) => t.team === team && t.alive).length; const tot = (team) => G.tanks.filter((t) => t.team === team).length;
    const pips = (team, cls) => G.tanks.filter((t) => t.team === team).map((t) => `<i class="${t.alive ? cls : 'dead'}" title="${t.name}"></i>`).join('');
    this.$('h-ally').innerHTML = `<b>${alive(0)}</b>${pips(0, 'a')}`; this.$('h-enemy').innerHTML = `${pips(1, 'e')}<b>${alive(1)}</b>`; void tot;
    const tl = Math.max(0, G.timeLimit - G.time); this.$('h-timer').textContent = `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
    this.$('h-cap0').style.width = G.capture[0].points + '%'; this.$('h-cap1').style.width = G.capture[1].points + '%';
    this.panelT = (this.panelT || 0) - dt; const doPanel = this.panelT <= 0; if (doPanel) this.panelT = 0.1;
    // vehicle panel
    if (doPanel) {
    const s = p.spec; const mod = (k, label) => `<span class="mod ${p.modules[k] >= 1 ? 'ok' : p.modules[k] > 0 ? 'dmg' : 'dead'}">${label}</span>`;
    this.$('h-veh').innerHTML = `<div class="vn">${s.short} <small>${s.nation} · ${s.era}</small></div>
      <div class="hpwrap"><div class="hpbar"><i style="width:${p.hp / p.maxHp * 100}%"></i><span>${Math.ceil(p.hp)} / ${p.maxHp}</span></div>${(p.abilities && p.abilities.magazine) ? `<div class="magfan" title="magazine">${Array.from({length: p.abilities.magazine.size}, (_, i) => `<i class="${i < p.abilities.magLeft ? 'on' : ''}"></i>`).join('')}</div>` : ''}</div>
      <div class="row"><span class="spd">${Math.round(Math.abs(p.speed) * 3.6)}<small> km/h</small></span>${mod('engine', 'ENGINE')}${mod('tracks', p.trackRepair > 0 ? 'TRACKS ' + Math.ceil(p.trackRepair) + 's' : 'TRACKS')}${mod('gun', 'GUN')}${mod('turret', 'TURRET')}</div>
      <div class="crew">${p.crew.map((c) => `<span class="${c.alive ? 'ok' : 'dead'}">${c.role}</span>`).join('')}</div>
      ${p.burning > 0 ? '<div class="kits"><span class="fire">🔥 FIRE</span></div>' : ''}`;
    // equipment slots (keys 4/5/6)
    const E = p.equip; const lf = E.factor;
    this.$('h-items').innerHTML = E.slots.map((it, i) => { const ready = it.def.passive || (it.charges > 0 && it.cd <= 0); const st = it.def.passive ? 'PASSIVE' : it.active > 0 ? `ACTIVE ${Math.ceil(it.active)}s` : it.charges <= 0 ? 'EMPTY' : it.cd > 0 ? `${Math.ceil(it.cd)}s` : 'READY';
      return `<div class="item ${ready ? 'ok' : 'cd'} ${it.active > 0 ? 'on' : ''}"><b>${i + 4}</b><span class="ic">${it.def.icon}</span><div>${it.def.name}<small>${st}${it.def.passive ? '' : ' · ×' + it.charges}</small></div>${!it.def.passive && it.cd > 0 ? `<i style="width:${(1 - it.cd / it.def.cd) * 100}%"></i>` : ''}</div>`; }).join('') +
      `<div class="load">Load ${E.kg} kg · speed ×${lf.toFixed(3)}</div>`;
    // ammo
    this.$('h-ammo').innerHTML = s.shells.map((sh, i) => `<div class="slot ${i === p.shellIdx ? 'sel' : ''} ${p.ammo[i] ? '' : 'empty'}"><b>${i + 1}</b><div>${sh.name}<small>${sh.type} · ${sh.pen} mm · ${sh.damage} dmg · ${sh.velocity} m/s</small></div><span>${p.ammo[i]}</span></div>`).join('') +
      `<div class="reload"><i style="width:${(1 - p.reloadLeft / p.reloadTime()) * 100}%"></i><span>${p.reloadLeft > 0 ? 'RELOADING ' + p.reloadLeft.toFixed(1) + 's' : 'READY'}</span></div>`;
    }
    // concealment
    const st = this.$('h-status'); const sinceFire = G.time - p.lastFired;
    if (!p.alive) { st.textContent = ''; st.className = 'status'; }
    else {
      const cam = Math.round((p.camo || 0) * 100); const vr = Math.round(Math.max(50, 400 * (1 - (p.camo || 0))));
      const why = `${p.inBush ? '🌿 IN BUSH' : 'IN THE OPEN'}${Math.abs(p.speed) > 1 ? ' · moving' : ''}${p.equip.has('camonet') && G.time - (p.lastMoving ?? G.time) > 3 ? ' · net' : ''}`;
      if (sinceFire < 5) { st.textContent = `${why} — CAMO ${cam}% (firing: revealed ${(5 - sinceFire).toFixed(1)}s) · seen within ~${vr} m`; st.className = 'status revealed'; }
      else if (p.inBush || cam >= 30) { st.textContent = `${why} — CAMO ${cam}% · seen within ~${vr} m (always within 50 m)`; st.className = 'status hidden'; }
      else { st.textContent = ''; st.className = 'status'; }
    }
    this.$('h-spotted').style.display = p.alive && p.spotted[1] ? 'block' : 'none';
    // damage direction
    const dd = this.$('h-dmgdir'); if (this.dmgT > 0 && this.dmgSrc) { this.dmgT -= dt; const ang = Math.atan2(this.dmgSrc.x - p.pos.x, this.dmgSrc.z - p.pos.z) - G.cam.yaw; dd.style.display = 'block'; dd.style.transform = `translate(-50%,-50%) rotate(${-ang}rad)`; dd.style.opacity = Math.min(1, this.dmgT); } else dd.style.display = 'none';
    this.miniT -= dt; if (this.miniT <= 0) { this.miniT = 0.15; this.drawMini(); }
    this.updateMarkers(camera);
    this.$('h-scope').style.display = G.cam.sniper ? 'block' : 'none'; this.$('h-zoom').textContent = '×' + G.cam.zoom + '  ·  ' + G.camera.fov.toFixed(1) + '°';
    // aim-assist lock marker (just under the crosshair centre)
    const A = G.assist; const ah = this.$('h-assist'); let aTxt = '', aCls = 'assist';
    if (p.alive && G.lock) { aTxt = 'GUN LOCK · ' + G.lock.spec.short; aCls += ' gun'; }
    else if (p.alive && A.target) { aTxt = '◆ LOCK · ' + A.target.spec.short + (A.offPx() > 4 ? ` <small>${Math.round(A.offPx() / 110 * 100)}%</small>` : ''); aCls += ' on'; }
    else if (p.alive && !A.enabled) { aTxt = ''; }
    if (ah._t !== aTxt) { ah.innerHTML = aTxt; ah._t = aTxt; } if (ah.className !== aCls) ah.className = aCls; ah.style.display = aTxt ? 'block' : 'none';
    const av = G.armorView; const avh = this.$('h-av');
    const avTxt = G.cam.sniper ? (av.enabled ? `<b>ARMOR VIEW ON</b> [X]<br><small>${G.player.shell.name}</small> <span class="lg g">will pen</span><span class="lg y">may pen</span><span class="lg r">no pen / ricochet</span><span class="lg n">no armor</span>` : '<b>ARMOR VIEW OFF</b><br>press [X] to show penetration zones') : '';
    if (avh._t !== avTxt) { avh.innerHTML = avTxt; avh._t = avTxt; }
  }
  setReticle(sx, sy, radius, state, text) {
    const r = this.$('h-ret'); r.style.transform = `translate(${sx}px, ${sy}px)`; r.style.visibility = sx === -100 && sy === -100 ? 'hidden' : ''; const ring = r.firstChild; const R = Math.max(0, Number.isFinite(radius) ? radius : 0);
    ring.style.width = ring.style.height = R * 2 + 'px'; ring.style.marginLeft = ring.style.marginTop = -R + 'px'; ring.style.boxSizing = 'border-box'; r.className = 'reticle ' + state + (this.g.player && this.g.player.bloom < 1.08 ? ' aimed' : ''); const pen = this.$('h-pen'); pen.textContent = text; pen.style.top = Math.max(22, Math.min(R + 8, 80)) + 'px';
  }
  scoreboard(show) {
    const b = this.$('h-board'); if (!show) { b.style.display = 'none'; return; }
    const row = (t) => `<tr class="${t.alive ? '' : 'dead'} ${t.isPlayer ? 'me' : ''}"><td>${t.name}</td><td>${t.spec.short}</td><td>${Math.round(t.stats.damage)}</td><td>${t.stats.kills}</td><td>${t.alive ? Math.ceil(t.hp) : '✖'}</td></tr>`;
    const tbl = (team, title) => `<div><h3>${title}</h3><table><tr><th>Name</th><th>Tank</th><th>Damage</th><th>Kills</th><th>HP</th></tr>${this.g.tanks.filter((t) => t.team === team).map(row).join('')}</table></div>`;
    b.innerHTML = `<div class="box wide">${tbl(0, 'Allies')}${tbl(1, 'Enemies')}</div>`; b.style.display = 'flex';
  }
  showEnd(result, reason) {
    const e = this.$('h-end'); const p = this.g.player;
    e.innerHTML = `<div class="box"><h1 class="${result}">${result === 'win' ? 'VICTORY' : result === 'lose' ? 'DEFEAT' : 'DRAW'}</h1><p>${reason}</p>
      <p>Damage dealt <b>${Math.round(p.stats.damage)}</b> · Kills <b>${p.stats.kills}</b> · Shots <b>${p.stats.shots}</b> · Hits <b>${p.stats.hits}</b> · Penetrations <b>${p.stats.pens}</b></p>
      <button id="h-again">Back to garage</button></div>`;
    e.style.display = 'flex'; e.querySelector('#h-again').onclick = () => this.g.exit();
  }
  setPaused(v) { this.$('h-pause').style.display = v ? 'flex' : 'none'; }
  destroy() { this.root.remove(); }
}
void TANKS;
