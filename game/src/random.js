// A small seeded random generator (mulberry32), so the valley, the trees,
// the clouds and every sortie are the same for the same seed. Nothing in
// the game ever calls Math.random: determinism is a feature, not luck.

export function makeRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 1-D noise from a seeded generator: a row of random control
// points, cosine-interpolated, so the terrain rolls instead of jumping.
export function makeNoise(seed, spacing, points) {
  const rand = makeRandom(seed);
  const values = [];
  for (let i = 0; i < points; i += 1) values.push(rand() * 2 - 1);
  return function noiseAt(position) {
    const scaled = position / spacing;
    const index = Math.floor(scaled);
    const fraction = scaled - index;
    const a = values[((index % points) + points) % points];
    const b = values[(((index + 1) % points) + points) % points];
    const smooth = (1 - Math.cos(fraction * Math.PI)) / 2;
    return a + (b - a) * smooth;
  };
}
