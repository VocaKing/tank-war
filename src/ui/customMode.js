// Custom mode: edit tank stats and apply to both teams
export class CustomMode {
  constructor(root, onApply) {
    this.root = root;
    this.onApply = onApply;
    this.panel = null;
  }
  show(tankId) {
    if (this.panel) this.panel.remove();
    const p = document.createElement('div');
    p.className = 'custom-panel';
    p.innerHTML = `
      <div class="custom-head">Custom Mode — ${tankId}</div>
      <div class="custom-row"><label>HP</label><input type="number" id="cm-hp" value="1200"></div>
      <div class="custom-row"><label>Max Speed (km/h)</label><input type="number" id="cm-speed" value="60"></div>
      <div class="custom-row"><label>Turret Traverse (°/s)</label><input type="number" id="cm-turret" value="30"></div>
      <div class="custom-row"><label>Reload (s)</label><input type="number" id="cm-reload" value="6" step="0.1"></div>
      <div class="custom-row"><label>Shell Damage</label><input type="number" id="cm-dmg" value="400"></div>
      <div class="custom-row"><label>Apply to both teams</label><input type="checkbox" id="cm-both" checked></div>
      <button id="cm-apply">Apply & Start</button>
      <button id="cm-close">Close</button>
    `;
    p.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1c16;color:#e8e6dc;padding:16px;border:1px solid #3a3c32;z-index:100;min-width:280px;';
    document.body.appendChild(p);
    this.panel = p;
    p.querySelector('#cm-close').onclick = () => p.remove();
    p.querySelector('#cm-apply').onclick = () => {
      const mods = {
        hp: +p.querySelector('#cm-hp').value,
        maxSpeed: +p.querySelector('#cm-speed').value,
        turretTraverse: +p.querySelector('#cm-turret').value,
        reload: +p.querySelector('#cm-reload').value,
        damage: +p.querySelector('#cm-dmg').value,
        both: p.querySelector('#cm-both').checked,
      };
      this.onApply(mods);
      p.remove();
    };
  }
}
