import { createArmorOverlay } from '../game/armorOverlay.js';

const previews = new WeakMap();
export function applyArmorPreview(model, spec, shell = spec.shells[0]) {
  if (!model) return { n: 0, pen: 0 };
  let preview = previews.get(model);
  if (!preview) {
    preview = { overlay: createArmorOverlay(model, spec, true), spec };
    previews.set(model, preview);
  }
  preview.shell = shell || spec.shells[0];
  updateArmorPreview(model);
  return { n: preview.overlay.layers.length, pen: preview.shell.pen, shell: preview.shell.name };
}

export function updateArmorPreview(model) {
  const preview = previews.get(model);
  if (!preview) return;
  model.root.updateWorldMatrix(true, true);
  preview.overlay.update(preview.spec.armor, preview.shell);
}

export function clearArmorPreview(model) {
  previews.get(model)?.overlay.dispose();
  previews.delete(model);
}
