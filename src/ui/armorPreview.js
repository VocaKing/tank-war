// Armor preview mode for garage: shows penetration colors on the selected tank
import { ArmorView } from '../game/armorView.js';

export function addArmorPreviewButton(garageRoot, garage) {
  const btn = document.createElement('button');
  btn.textContent = 'Armor Preview';
  btn.style.cssText = 'position:absolute;top:8px;right:8px;z-index:20;background:#2a2c24;color:#e8e6dc;border:1px solid #4a4c42;padding:6px 10px;cursor:pointer;';
  garageRoot.appendChild(btn);
  let active = false;
  btn.onclick = () => {
    active = !active;
    btn.textContent = active ? 'Armor Preview: ON' : 'Armor Preview';
    if (garage && garage.setArmorMode) garage.setArmorMode(active);
  };
  return btn;
}
