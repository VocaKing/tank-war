const BUDGET = {
  high: { pixels: 3_250_000, ratio: 1.5 },
  medium: { pixels: 2_100_000, ratio: 1.25 },
  low: { pixels: 1_250_000, ratio: 1 },
  menu: { pixels: 2_500_000, ratio: 1.5 },
};

export function renderPixelRatio(quality, width, height, deviceRatio, mobile) {
  const { pixels, ratio } = BUDGET[quality] ?? BUDGET.high;
  return Math.min(deviceRatio, mobile ? 0.85 : ratio, Math.sqrt(pixels / (width * height)));
}
