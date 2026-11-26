// Track gauge is measured between the two track centrelines. Fenders and
// side skirts can make the chassis wider than the tracks.
export function trackCenterOffset(dimensions) {
  return (dimensions.trackGauge ?? (dimensions.W - dimensions.trackW)) / 2;
}
