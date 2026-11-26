import { ITEM_IDS } from '../game/items.js';

export function equipmentIcon(id) {
  const key = ITEM_IDS.includes(id) ? id : 'empty';
  return `<span class="equipment-icon equipment-icon--${key}" aria-hidden="true"></span>`;
}

export function equipmentStatus(slot) {
  if (!slot) return { state: 'empty', label: 'Empty', count: '' };
  if (slot.def.passive) return { state: 'passive', label: 'Passive', count: '' };
  const count = `×${slot.charges}`;
  if (slot.active > 0) return { state: 'active', label: `${Math.ceil(slot.active)}s active`, count };
  if (slot.charges <= 0) return { state: 'empty', label: 'Spent', count };
  if (slot.cd > 0) return { state: 'cooldown', label: `${Math.ceil(slot.cd)}s`, count };
  return { state: 'ready', label: 'Ready', count };
}
