// In-game HUD (DOM overlay)
import * as THREE from 'three';
import { ITEM_SLOTS } from '../game/items.js';
import { TANKS } from '../game/tankData.js';
import { equipmentIcon, equipmentStatus } from './equipment.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const formatHp = new Intl.NumberFormat('en-US').format;
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };

const DAMAGE_HOLD = 0.22;
const DAMAGE_DRAIN = 0.65;
const HEALTH_LAYERS = '<i class="hp-trail"></i><i class="hp-fill"></i>';
const HEALTH_EVENTS = '<div class="hp-events"><div class="damage"></div><div class="module-loss"></div></div>';

function trailingHp(state, hp, now) {
  if (!state || state.trailStart <= hp) return hp;
  const progress = Math.min(1, Math.max(0, (now - state.hitAt - DAMAGE_HOLD) / DAMAGE_DRAIN));
  return hp + (state.trailStart - hp) * (1 - progress) ** 2;
}

function updateHealthDisplay(parts, tank, state, now) {
  const hp = tank.hp / tank.maxHp;
  parts.bar.style.setProperty('--hp-fill', hp);
  parts.bar.style.setProperty('--hp-trail', trailingHp(state, tank.hp, now) / tank.maxHp);
  parts.bar.classList.toggle('hp-hit', !!state && now - state.hitAt < DAMAGE_HOLD);
  setText(parts.damage, state?.damageUntil > now ? '−' + formatHp(Math.max(1, Math.round(state.damageTotal))) : '');
  let modules = '';
  if (state?.moduleNotices) {
    for (const [name, until] of state.moduleNotices) {
      if (until <= now) state.moduleNotices.delete(name);
      else modules += (modules ? ' · ' : '') + name;
    }
  }
  setText(parts.modules, modules);
}

export class HUD {
  constructor(root, game) {
    this.g = game; this.root = el('div', 'hud'); root.appendChild(this.root);
    this.root.innerHTML = `
      <div class="top"><div class="teams"><div class="tcount ally" id="h-ally"></div><div class="timer" id="h-timer">15:00</div><div class="tcount enemy" id="h-enemy"></div></div>
        <div class="caps"><div class="cap ally"><span>Allied base</span><div class="bar"><i id="h-cap0"></i></div></div><div class="cap enemy"><span>Enemy base</span><div class="bar"><i id="h-cap1"></i></div></div></div>
        <div class="control-status" id="h-control"><span id="h-control-text"></span><div class="bar"><i id="h-control-progress"></i></div></div></div>
      <div class="control-marker" id="h-control-marker" aria-hidden="true" hidden>C</div>
      <div class="killfeed" id="h-feed"></div>
      <div class="markers" id="h-markers"></div>
      <div class="scope" id="h-scope"><div class="scope-ring"></div><div class="mil"></div><div class="ticks"></div><div class="zoom" id="h-zoom">x4</div><div class="avhint" id="h-av"></div></div>
      <div class="cross" id="h-cross"></div>
      <div class="assist" id="h-assist"></div>
      <div class="reticle" id="h-ret"><div class="ring"></div><div class="dot"></div><div class="lockbr"></div><div class="pen" id="h-pen"></div></div>
      <div class="msgs" id="h-msgs"></div>
      <div class="dmgdir" id="h-dmgdir"></div>
      <div class="spotted" id="h-spotted">⚠ SPOTTED</div>
      <div class="panel left" id="h-veh"><div class="vn" id="h-veh-name"></div>
        <div class="hpwrap"><div class="hpbar health-track">${HEALTH_LAYERS}<span id="h-veh-hp"></span></div><div class="magfan" id="h-veh-magazine" title="magazine"></div>${HEALTH_EVENTS}</div>
        <div id="h-veh-info"></div></div>
      <div class="combat-deck"><div class="status" id="h-status"></div><div class="panel items" id="h-items"></div><div class="panel ammo" id="h-ammo"></div></div>
      <div class="panel map"><canvas id="h-mini" width="260" height="260"></canvas></div>
      <div class="help" id="h-help"><b>Controls</b><br>W/S throttle · A/D steer · Mouse aim · LMB fire<br>RMB / Shift sniper · Wheel zoom ×2/×4/×8/×16 · 1/2/3 ammo<br>X armor view (sniper) · E gun lock · aim assist: hold the crosshair on an enemy to soft-lock, pull away to break<br>G vehicle ability · B firing brace / artillery deploy · V weapon mode · N armour kit · H suspension · 4/5/6 equipment (R repair · F extinguisher) · Tab scores · Esc menu<br><i>Bushes add camouflage – firing reduces it; anyone within 50 m sees you.</i></div>
      <div class="overlay" id="h-board"></div>
      <div class="overlay" id="h-pause"><div class="box"><h2>Paused</h2><button id="h-resume">Resume</button><button id="h-aa"></button><button id="h-quit">Quit to menu</button></div></div>
      <div class="overlay" id="h-end"></div>`;
    const nodes = new Map(Array.from(this.root.querySelectorAll('[id]'), node => [node.id, node]));
    this.$ = (id) => nodes.get(id);
    this.panelHtml = new Map();
    this.teams = ['ally', 'enemy'].map((side, team) => {
      const container = this.$('h-' + side);
      const count = el('b');
      const pips = game.tanks.filter(tank => tank.team === team).map(tank => {
        const pip = el('i');
        pip.title = tank.name;
        container.appendChild(pip);
        return { tank, pip };
      });
      if (team === 0) container.prepend(count);
      else container.appendChild(count);
      return { count, pips, aliveClass: team === 0 ? 'a' : 'e' };
    });
    const playerPanel = this.$('h-veh');
    this.playerHealth = {
      bar: playerPanel.querySelector('.hpbar'),
      damage: playerPanel.querySelector('.damage'),
      modules: playerPanel.querySelector('.module-loss')
    };
    this.markerPosition = new THREE.Vector3();
    this.hullCorner = new THREE.Vector3();
    const point = game.world.controlPoint;
    this.controlPosition = new THREE.Vector3(point.x, game.world.groundHeight(point.x, point.z) + 14, point.z);
    this.mini = this.$('h-mini').getContext('2d'); this.markerPool = []; this.markerStates = new WeakMap(); this.msgTimer = 0; this.feed = [];
    this.$('h-resume').onclick = () => game.setPaused(false);
    const aa = this.$('h-aa'); const aaTxt = () => { aa.textContent = 'Aim assist: ' + (game.assist.enabled ? 'ON' : 'OFF'); }; aaTxt();
    aa.onclick = () => { game.assist.setEnabled(!game.assist.enabled); try { localStorage.setItem('tw_aa', game.assist.enabled ? '1' : '0'); } catch (e) { /* private mode */ } aaTxt(); }; this.$('h-quit').onclick = () => game.exit();
    setTimeout(() => this.$('h-help').classList.add('fade'), 14000);
    this.buildMiniBase(); this.miniT = 0;
  }
  setPanelHtml(id, html) {
    if (this.panelHtml.get(id) === html) return;
    this.panelHtml.set(id, html);
    this.$(id).innerHTML = html;
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
    const point = G.world.controlPoint;
    const [cx, cyPoint] = this.toM(point.x, point.z), radius = point.r / half * S / 2;
    const control = G.control;
    const color = control.contested || control.team === null ? '#f6cb69' : control.team === 0 ? '#6fe37f' : '#ff7769';
    g.save();
    g.beginPath(); g.arc(cx, cyPoint, radius, 0, Math.PI * 2);
    g.fillStyle = '#18222c'; g.fill();
    g.strokeStyle = color; g.lineWidth = 2; g.stroke();
    g.fillStyle = color; g.font = 'bold 12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('C', cx, cyPoint);
    g.restore();
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
  updateControl(camera) {
    const G = this.g, control = G.control;
    const follow = G.cam.follow.pos, point = this.controlPosition;
    const distance = Math.round(Math.hypot(follow.x - point.x, follow.z - point.z));
    const side = control.team === null ? '' : control.team === G.player.team ? 'ally' : 'enemy';
    const status = control.contested ? '双方争夺' : control.team === null ? '中立' : control.occupied ? (side === 'ally' ? '我方占领中' : '敌方占领中') : '进度回落';
    const label = this.$('h-control');
    const style = 'control-status' + (side ? ' ' + side : '');
    if (label.className !== style) label.className = style;
    setText(this.$('h-control-text'), `据点 C · ${status} · ${Math.floor(control.points)}% · ${distance} m`);
    this.$('h-control-progress').style.width = control.points + '%';
    const v = this.markerPosition.copy(point).project(camera);
    const marker = this.$('h-control-marker');
    marker.hidden = v.z < -1 || v.z > 1 || Math.abs(v.x) > 0.94 || Math.abs(v.y) > 0.9;
    if (!marker.hidden) {
      const cls = 'control-marker' + (control.contested || !side ? '' : ' ' + side);
      if (marker.className !== cls) marker.className = cls;
      marker.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`;
    }
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
  healthState(tank) {
    let state = this.markerStates.get(tank);
    if (!state) {
      state = { trailStart: 0, hitAt: -Infinity, damageTotal: 0, damageUntil: 0, destroyedUntil: 0 };
      this.markerStates.set(tank, state);
    }
    return state;
  }
  recordDamage(tank, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const state = this.healthState(tank);
    const now = this.g.time;
    const before = Math.min(tank.maxHp, tank.hp + amount);
    state.trailStart = trailingHp(state, before, now);
    state.hitAt = now;
    state.damageTotal = (state.damageUntil > now ? state.damageTotal : 0) + amount;
    state.damageUntil = now + 1.65;
  }
  recordModuleLoss(tank, label) {
    const state = this.healthState(tank);
    state.moduleNotices ??= new Map();
    state.moduleNotices.set(label, this.g.time + 2.4);
  }
  kill(attacker, victim, cause) {
    const player = this.g.player;
    const now = this.g.time;
    const state = this.markerStates.get(victim);
    if (state && (victim.team === player.team || victim.spotted[player.team])) {
      state.destroyedUntil = Math.max(now, state.hitAt + DAMAGE_HOLD + DAMAGE_DRAIN);
      if (state.moduleNotices) {
        for (const until of state.moduleNotices.values()) state.destroyedUntil = Math.max(state.destroyedUntil, until);
      }
    }
    const c = (t) => (t ? `<span class="${t.team === this.g.player.team ? 'a' : 'e'}">${t.name} <small>${t.spec.short}</small></span>` : '?');
    const f = el('div', 'kf', `${c(attacker)} <b>${cause === 'ammo' ? '💥' : '✖'}</b> ${c(victim)}`); this.$('h-feed').prepend(f); setTimeout(() => f.remove(), 12000);
    if (attacker && attacker.isPlayer) this.message('ENEMY DESTROYED', '#ffd34d', true);
    if (victim.isPlayer) this.message('YOU WERE DESTROYED — spectating allies (Esc for menu)', '#ff6050', true);
  }
  healthBarWidth(tank, camera, viewportWidth) {
    const { W, L, hullH } = tank.spec.dims;
    const corner = this.hullCorner;
    const maxWidth = Math.min(240, viewportWidth * 0.28);
    let left = Infinity, right = -Infinity;
    // Project the hull envelope in its current pose, independent of barrel length.
    for (let i = 0; i < 8; i++) {
      corner.set((i & 1 ? W : -W) / 2, i & 2 ? hullH : 0, (i & 4 ? L : -L) / 2)
        .applyQuaternion(tank.quat).add(tank.pos).applyMatrix4(camera.matrixWorldInverse);
      if (corner.z >= -camera.near) return maxWidth;
      const x = corner.applyMatrix4(camera.projectionMatrix).x;
      left = Math.min(x, left);
      right = Math.max(x, right);
    }
    return Math.min(maxWidth, Math.max(14, Math.round((right - left) * viewportWidth * 0.5 * 1.75)));
  }
  updateMarkers(camera) {
    const G = this.g; const W = innerWidth, H = innerHeight; let n = 0; const v = this.markerPosition;
    for (const t of G.tanks) {
      if (t === G.player) continue;
      const state = this.markerStates.get(t);
      if (!t.alive && !(state?.destroyedUntil > G.time)) continue;
      const ally = t.team === G.player.team; if (!ally && !t.spotted[G.player.team]) continue;
      v.copy(t.pos); v.y += t.spec.dims.hullH + t.spec.dims.turretH + 1.6; const d = camera.position.distanceTo(v); if (ally && d > 500) continue;
      v.project(camera); if (v.z > 1 || v.z < -1) continue; const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H; if (sx < -70 || sx > W + 70 || sy < -50 || sy > H + 50) continue;
      let m = this.markerPool[n];
      if (!m) {
        m = el('div', 'mk', `<div class="nm"></div><div class="hp-meta"></div><div class="hp-row"><div class="hp health-track">${HEALTH_LAYERS}</div>${HEALTH_EVENTS}</div><div class="rl"><i></i></div><div class="ar">▼</div>`);
        m._parts = {
          name: m.querySelector('.nm'),
          hpMeta: m.querySelector('.hp-meta'),
          hpRow: m.querySelector('.hp-row'),
          bar: m.querySelector('.hp'),
          damage: m.querySelector('.damage'),
          modules: m.querySelector('.module-loss'),
          reload: m.querySelector('.rl'),
          reloadFill: m.querySelector('.rl i')
        };
        this.$('h-markers').appendChild(m); this.markerPool.push(m);
      }
      const barWidth = this.healthBarWidth(t, camera, W);
      m.style.display = 'block';
      m.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
      const cls = 'mk ' + (ally ? 'a' : 'e') + (sx + barWidth * 0.5 + 170 > W ? ' events-left' : '');
      if (m.className !== cls) m.className = cls;
      const parts = m._parts;
      setText(parts.name, `${t.spec.short}${d < 700 ? ' · ' + Math.round(d) + 'm' : ''}`);
      parts.hpRow.style.width = barWidth + 'px';
      updateHealthDisplay(parts, t, state, G.time);
      if (ally) {
        if (t.alive && t.reloadLeft > 0) { parts.reload.style.display = 'block'; parts.reloadFill.style.width = ((1 - t.reloadLeft / t.reloadTime()) * 100) + '%'; }
        else parts.reload.style.display = 'none';
      } else {
        const hp = Math.ceil(t.hp), maxHp = Math.round(t.maxHp);
        if (parts.hp !== hp || parts.maxHp !== maxHp) {
          parts.hpMeta.textContent = `HP ${formatHp(hp)} / ${formatHp(maxHp)}`;
          parts.hp = hp;
          parts.maxHp = maxHp;
        }
        parts.reload.style.display = 'none';
      }
      n++;
    }
    for (let i = n; i < this.markerPool.length; i++) this.markerPool[i].style.display = 'none';
  }
  update(dt, camera) {
    const G = this.g, p = G.player;
    for (const { count, pips, aliveClass } of this.teams) {
      let alive = 0;
      for (const { tank, pip } of pips) {
        const cls = tank.alive ? aliveClass : 'dead';
        if (pip.className !== cls) pip.className = cls;
        if (tank.alive) alive++;
      }
      setText(count, String(alive));
    }
    const tl = Math.max(0, G.timeLimit - G.time); setText(this.$('h-timer'), `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`);
    this.$('h-cap0').style.width = G.capture[0].points + '%'; this.$('h-cap1').style.width = G.capture[1].points + '%';
    this.updateControl(camera);
    this.panelT = (this.panelT || 0) - dt; const doPanel = this.panelT <= 0; if (doPanel) this.panelT = 0.1;
    // vehicle panel
    if (doPanel) {
    const s = p.spec; const mod = (k, label) => `<span class="mod ${p.modules[k] >= 1 ? 'ok' : p.modules[k] > 0 ? 'dmg' : 'dead'}">${label}</span>`;
    const ability = p.abilities;
    const dozerStatus = s.dozer
      ? `推土铲 · ${ability.dozerActive ? '施工 ' + Math.min(100, Math.floor(100 * ability.dozerTravel / s.dozer.travel)) + '%' :
        ability.dozerCooldown > 0 ? '冷却 ' + Math.ceil(ability.dozerCooldown) + 's' : '按 G 或点技能键'} · 剩 ${ability.dozerCharges} 次`
      : '';
    const mobilityStatus = p.trackRepairs.map((time, i) => time > 0 ? `${i === 0 ? 'L' : 'R'} ${Math.ceil(time)}s` : '').filter(Boolean).join(' · ');
    const specialStatus = p.usesSpade?.() ? `驻锄 · ${p.spadeState}` : s.artillery?.autoDeploy ? `自动部署 · ${p.autoArtilleryState}` : '';
    const kitStatus = s.armorPackages ? `装甲套件 · ${s.armorPackages[p.armorPackageIndex]?.name || '基础'}` : '';
    const movementStatus = p.afloat ? '浮航 · 主炮锁定' : [dozerStatus, specialStatus, kitStatus].filter(Boolean).join(' · ');
    const trackStatus = mobilityStatus;
    this.setPanelHtml('h-veh-name', `${s.short} <small>${s.nation} · ${s.era}</small>`);
    this.setPanelHtml('h-veh-magazine', ability.magazine ? Array.from({ length: ability.magazine.size }, (_, i) => `<i class="${i < ability.magLeft ? 'on' : ''}"></i>`).join('') : '');
    this.setPanelHtml('h-veh-info', `<div class="row"><span class="spd">${Math.round(Math.abs(p.speed) * 3.6)}<small> km/h</small></span>${mod('engine', 'ENGINE')}${mod(p.mobilityModule || 'tracks', trackStatus || p.mobilityLabel || 'TRACKS')}${mod('gun', 'GUN')}${mod('turret', 'TURRET')}</div>
      ${movementStatus ? `<div class="crew"><span>${movementStatus}</span></div>` : ''}
      <div class="crew">${p.crew.map((c) => `<span class="${c.alive ? 'ok' : 'dead'}">${c.role}</span>`).join('')}</div>
      ${p.burning > 0 ? '<div class="kits"><span class="fire">🔥 FIRE</span></div>' : ''}`);
    // equipment slots (keys 4/5/6)
    const E = p.equip; const lf = E.factor;
    this.setPanelHtml('h-items', Array.from({ length: ITEM_SLOTS }, (_, i) => {
      const slot = E.slots[i];
      const { state, label, count } = equipmentStatus(slot);
      const name = slot?.def.name ?? 'Empty slot';
      const cooldown = state === 'cooldown' ? `<i style="width:${(1 - slot.cd / slot.def.cd) * 100}%"></i>` : '';
      return `<div class="item equipment-state-${state}" title="${name}"><kbd>${i + 4}</kbd>${equipmentIcon(slot?.id)}<div class="item-info"><span class="item-name">${name}</span>${slot ? `<small>${label}${count ? ` · ${count}` : ''}</small>` : ''}</div>${cooldown}</div>`;
    }).join('') + `<div class="load">Load ${E.kg} kg · speed ×${lf.toFixed(3)}</div>`);
    // ammo
    this.setPanelHtml('h-ammo', s.shells.map((sh, i) => `<div class="slot ${!ability.usingSecondary && i === p.shellIdx ? 'sel' : ''} ${p.ammo[i] ? '' : 'empty'}"><b>${i + 1}</b><div>${sh.name}<small>${sh.type} · ${sh.pen} mm · ${sh.damage} dmg · ${sh.velocity} m/s</small></div><span>${p.ammo[i]}</span></div>`).join('') +
      (s.secondary ? `<div class="slot ${ability.usingSecondary ? 'sel' : ''} ${p.secondaryRounds ? '' : 'empty'}"><b>G</b><div>${s.secondary.shell.name}<small>副炮 · ${p.secondaryReloadLeft > 0 ? p.secondaryReloadLeft.toFixed(1) + 's' : '就绪'}</small></div><span>${p.secondaryRounds}</span></div>` : '') +
      `<div class="reload"><i style="width:${Math.max(0, 1 - p.fireReloadLeft / (ability.usingSecondary ? s.secondary.reload : p.reloadTime())) * 100}%"></i><span>${p.afloat ? '浮航中' : p.fireReloadLeft > 0 ? 'RELOADING ' + p.fireReloadLeft.toFixed(1) + 's' : 'READY'}</span></div>`);
    }
    // concealment
    const st = this.$('h-status'); const sinceFire = G.time - p.lastFired;
    let statusText = '', statusClass = 'status';
    if (p.alive) {
      const cam = Math.round((p.camo || 0) * 100); const vr = Math.round(Math.max(50, 400 * (1 - (p.camo || 0))));
      const why = `${p.inBush ? '🌿 IN BUSH' : 'IN THE OPEN'}${Math.abs(p.speed) > 1 ? ' · moving' : ''}${p.equip.has('camonet') && G.time - (p.lastMoving ?? G.time) > 3 ? ' · net' : ''}`;
      if (sinceFire < 5) { statusText = `${why} — CAMO ${cam}% (firing: revealed ${(5 - sinceFire).toFixed(1)}s) · seen within ~${vr} m`; statusClass += ' revealed'; }
      else if (p.inBush || cam >= 30) { statusText = `${why} — CAMO ${cam}% · seen within ~${vr} m (always within 50 m)`; statusClass += ' hidden'; }
    }
    setText(st, statusText);
    if (st.className !== statusClass) st.className = statusClass;
    this.$('h-spotted').style.display = p.alive && p.spotted[1] ? 'block' : 'none';
    // damage direction
    const dd = this.$('h-dmgdir'); if (this.dmgT > 0 && this.dmgSrc) { this.dmgT -= dt; const ang = Math.atan2(this.dmgSrc.x - p.pos.x, this.dmgSrc.z - p.pos.z) - G.cam.yaw; dd.style.display = 'block'; dd.style.transform = `translate(-50%,-50%) rotate(${-ang}rad)`; dd.style.opacity = Math.min(1, this.dmgT); } else dd.style.display = 'none';
    this.miniT -= dt; if (this.miniT <= 0) { this.miniT = 0.15; this.drawMini(); }
    setText(this.$('h-veh-hp'), `${Math.ceil(p.hp)} / ${p.maxHp}`);
    updateHealthDisplay(this.playerHealth, p, this.markerStates.get(p), G.time);
    this.updateMarkers(camera);
    this.$('h-scope').style.display = G.cam.sniper ? 'block' : 'none'; setText(this.$('h-zoom'), '×' + G.cam.zoom + '  ·  ' + G.camera.fov.toFixed(1) + '°');
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
    ring.hidden = R === 0;
    ring.style.width = ring.style.height = R * 2 + 'px'; ring.style.marginLeft = ring.style.marginTop = -R + 'px'; ring.style.boxSizing = 'border-box';
    const cls = 'reticle ' + state + (this.g.player && this.g.player.dispersionProgress < 0.025 ? ' aimed' : '');
    if (r.className !== cls) r.className = cls;
    const pen = this.$('h-pen'); setText(pen, text); pen.style.top = Math.max(22, Math.min(R + 8, 80)) + 'px';
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
