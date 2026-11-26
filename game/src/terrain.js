// Kestrel Valley — the ground the game flies over.
//
// The valley floor rolls on slow seeded noise, its walls rise steeply
// either side of the centreline, and a river meanders down the middle.
// Both runways are flat pads carved out of the floor. Everything here is
// pure data: the renderer draws it, the flight model collides with it,
// and the same seed always builds the same valley.

import { COURSE } from './config.js';
import { makeNoise, makeRandom } from './random.js';

// How high the valley floor is at a distance z along the course.
function floorHeight(z, floorNoise) {
  // Both runways sit at sea level, flat.
  if (z >= COURSE.runwayA.from && z <= COURSE.runwayA.to) return 0;
  if (z >= COURSE.runwayB.from && z <= COURSE.runwayB.to) return 0;
  // Between them the floor rolls between 6 and 34 metres — but it ramps
  // gently away from each runway, so a fresh takeoff never meets a wall
  // of ground, and the final approach glides down to a flat threshold.
  const base = 20 + floorNoise(z) * 14;
  const awayFromA = Math.max(0, Math.min(1, (z - COURSE.runwayA.to) / 1200));
  const towardB = Math.max(0, Math.min(1, (COURSE.runwayB.from - z) / 1200));
  return base * Math.min(awayFromA, towardB);
}

// Where the river's centreline is at distance z (metres off centreline).
function riverCentre(z, riverNoise) {
  return riverNoise(z) * 130;
}

export function createTerrain(seed) {
  const floorNoise = makeNoise(seed ^ 0x5f3759df, 900, 64);
  const riverNoise = makeNoise(seed ^ 0x1b873593, 1400, 48);
  const wallNoise = makeNoise(seed ^ 0x85ebca6b, 700, 64);
  const rand = makeRandom(seed ^ 0x27d4eb2f);

  // Trees stand clear of the runways and the river, scattered down the
  // valley in clumps the seed decides.
  const trees = [];
  for (let z = 500; z < COURSE.finishZ; z += 90) {
    const clump = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < clump; i += 1) {
      const side = rand() < 0.5 ? -1 : 1;
      const x = side * (70 + rand() * 300);
      trees.push({ z: z + rand() * 80, x, size: 0.8 + rand() * 0.9, hue: rand() });
    }
  }

  // Clouds drift far above the valley, placed once by the seed.
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      z: 400 + rand() * 9200,
      x: (rand() * 2 - 1) * 900,
      alt: 380 + rand() * 260,
      size: 60 + rand() * 140,
      speed: 2 + rand() * 4,
    });
  }

  function groundHeight(z, x) {
    const floor = floorHeight(z, floorNoise);
    const wall = Math.min(1.3, Math.max(0, (Math.abs(x) - 150) / 270));
    const walls = wall * wall * (90 + wallNoise(z) * 30);
    // The river carves a shallow channel where it runs.
    const river = riverCentre(z, riverNoise);
    const riverDip = Math.max(0, 1 - Math.abs(x - river) / 26) * 7;
    return floor + walls - riverDip;
  }

  return {
    groundHeight,
    riverCentreAt: (z) => riverCentre(z, riverNoise),
    floorHeightAt: (z) => floorHeight(z, floorNoise),
    trees,
    clouds,
    onRunway(z, x) {
      const a = COURSE.runwayA;
      const b = COURSE.runwayB;
      const halfA = a.width / 2;
      const halfB = b.width / 2;
      if (z >= a.from && z <= a.to && Math.abs(x) <= halfA) return 'A';
      if (z >= b.from && z <= b.to && Math.abs(x) <= halfB) return 'B';
      return null;
    },
  };
}
