// v3 equipment / consumables. Each tank carries up to 3 items (keys 4/5/6). Every item has a weight;
// the total carried load lowers top speed and acceleration (see loadFactor). Passive items work automatically.
export const ITEM_SLOTS = 3;
export const ITEMS = {
  repair: { name: 'Repair kit', icon: '🔧', kg: 260, charges: 2, cd: 45, desc: 'Instantly repairs every damaged or destroyed module (engine, tracks, gun, turret ring).' },
  medkit: { name: 'First-aid kit', icon: '✚', kg: 40, charges: 2, cd: 40, desc: 'Brings knocked-out crew members back to their stations.' },
  extinguisher: { name: 'Fire extinguisher', icon: '🧯', kg: 90, charges: 2, cd: 15, desc: 'Puts out an engine fire immediately.' },
  reload: { name: 'Reload booster', icon: '⚡', kg: 120, charges: 2, cd: 75, dur: 20, desc: 'Ready-rack drill: −30 % reload time for 20 s (also cuts the current reload).' },
  overdrive: { name: 'Engine overdrive', icon: '🔥', kg: 180, charges: 2, cd: 60, dur: 15, desc: 'Water-injection boost: +20 % top speed and +35 % acceleration for 15 s.' },
  smoke: { name: 'Smoke grenades', icon: '☁', kg: 150, charges: 3, cd: 25, dur: 22, desc: 'Fires a smoke screen ~15 m ahead of the turret that blocks line of sight for 22 s.' },
  camonet: { name: 'Camouflage net', icon: '🕸', kg: 220, passive: true, desc: 'Passive: +12 % camouflage after standing still for 3 s.' },
  optics: { name: 'Coated optics', icon: '🔭', kg: 60, passive: true, desc: 'Passive: +10 % view range.' },
};
export const ITEM_IDS = Object.keys(ITEMS);
export const DEFAULT_ITEMS = ['repair', 'extinguisher', 'medkit'];
export function sanitizeItems(arr) {
  const out = []; for (const id of Array.isArray(arr) ? arr : DEFAULT_ITEMS) if (ITEMS[id] && !out.includes(id) && out.length < ITEM_SLOTS) out.push(id);
  return out;
}
export const itemsKg = (ids) => ids.reduce((a, id) => a + (ITEMS[id]?.kg || 0), 0);
// Carried load → mobility factor (top speed and acceleration). Gear counts ×4 vs. its pure mass (external stowage
// raises rolling resistance and strains the suspension), so 500 kg costs ~5.6 % on a 34 t Sherman, ~3 % on a 62 t Abrams.
export const LOAD_AMPLIFY = 4;
export const loadFactor = (massT, kg) => massT / (massT + (LOAD_AMPLIFY * kg) / 1000);

export class Equipment {
  constructor(tank, ids) {
    this.tank = tank; this.slots = sanitizeItems(ids).map((id) => ({ id, def: ITEMS[id], charges: ITEMS[id].charges ?? Infinity, cd: 0, active: 0 }));
    this.kg = itemsKg(this.slots.map((s) => s.id)); this.factor = loadFactor(tank.spec.mass, this.kg);
  }
  has(id) { return this.slots.some((s) => s.id === id); }
  active(id) { const s = this.slots.find((x) => x.id === id); return !!s && (s.def.passive || s.active > 0); }
  update(dt) { for (const s of this.slots) { s.cd = Math.max(0, s.cd - dt); s.active = Math.max(0, s.active - dt); } }
  find(id) { return this.slots.findIndex((s) => s.id === id); }
  // returns [ok, message]
  use(i, game) {
    const s = this.slots[i]; const t = this.tank; if (!s || !t.alive) return [false, ''];
    if (s.def.passive) return [false, s.def.name + ' is passive'];
    if (s.charges <= 0) return [false, s.def.name + ': none left'];
    if (s.cd > 0) return [false, `${s.def.name}: ready in ${Math.ceil(s.cd)} s`];
    let msg = '';
    if (s.id === 'repair') {
      const broken = Object.entries(t.modules).filter(([, v]) => v < 1).map(([k]) => k); if (!broken.length) return [false, 'Nothing to repair'];
      for (const k of broken) {
        if (k === 'tracks') t.repairTracks();
        else t.modules[k] = 1;
      }
      msg = 'Repaired: ' + broken.join(', ');
    } else if (s.id === 'medkit') {
      const dead = t.crew.filter((c) => !c.alive); if (!dead.length) return [false, 'Crew is fine'];
      for (const c of dead) c.alive = true; msg = 'Crew healed: ' + dead.map((c) => c.role).join(', ');
    } else if (s.id === 'extinguisher') {
      if (!(t.burning > 0)) return [false, 'No fire']; t.burning = 0; msg = 'Fire extinguished';
    } else if (s.id === 'reload') { s.active = s.def.dur; t.reloadLeft *= 0.7; msg = 'Reload booster active (−30 %)'; }
    else if (s.id === 'overdrive') { s.active = s.def.dur; msg = 'Engine overdrive active'; }
    else if (s.id === 'smoke') { s.active = s.def.dur; game.deploySmoke(t, s.def.dur); msg = 'Smoke screen deployed'; }
    s.charges--; s.cd = s.def.cd; return [true, msg];
  }
}
