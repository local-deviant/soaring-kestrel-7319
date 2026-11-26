// Kestrel Run — tuning constants and the course layout.
//
// Units inside the simulation are metres, metres per second and degrees;
// the renderer converts to knots and feet for the HUD. One fixed step is
// 1/60 s, so the same seed always flies the same sortie.

export const STEP = 1 / 60;
export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;

// --- the aircraft -----------------------------------------------------------
export const PLANE = {
  stallSpeed: 28, // m/s, about 55 kt: slower than this and the wing quits
  cruiseSpeed: 62, // m/s, about 120 kt: the speed the course is tuned for
  maxSpeed: 80, // m/s, about 155 kt: full throttle, level, clean
  maxPitch: 24, // degrees of nose up or down the pilot can ask for
  maxBank: 48, // degrees of bank the pilot can ask for
  pitchRate: 34, // degrees per second the nose answers
  bankRate: 70, // degrees per second the wings answer
  thrust: 13.5, // m/s^2 at full throttle
  drag: 0.0021, // m/s^2 per (m/s)^2: drag grows with the square of speed
  gearDrag: 0.0011, // extra drag with the wheels down
  flapDrag: 0.0009, // extra drag per flap notch
  flapLift: 0.09, // extra lift authority per flap notch
  fuelCapacity: 100,
  fuelBurn: 0.42, // units per second at full throttle
  fuelBurnIdle: 0.08, // units per second at idle
  gearHeight: 1.6, // metres of clearance the wheels give on the ground
};

// --- the course -------------------------------------------------------------
// Runway A is where the sortie starts, Runway B where it ends; the valley
// between them holds eleven rings. Distances are metres along the course.
export const COURSE = {
  runwayA: { from: 0, to: 420, width: 26 },
  runwayB: { from: 8560, to: 9020, width: 30 },
  valleyHalfWidth: 420, // metres each side of the centreline the valley spans
  finishZ: 9020,
  parTime: 195, // seconds: beat it and the clock pays a bonus
};

export const RINGS = [
  { z: 900, x: -40, alt: 70, radius: 26 },
  { z: 1450, x: 60, alt: 115, radius: 26 },
  { z: 2050, x: -90, alt: 100, radius: 26 },
  { z: 2650, x: 30, alt: 165, radius: 26 },
  { z: 3300, x: -70, alt: 145, radius: 26 },
  { z: 4000, x: 80, alt: 220, radius: 26 },
  { z: 4700, x: -30, alt: 165, radius: 26 },
  { z: 5450, x: 90, alt: 120, radius: 26 },
  { z: 6200, x: -90, alt: 195, radius: 26 },
  { z: 6950, x: 40, alt: 135, radius: 26 },
  { z: 7650, x: -20, alt: 90, radius: 26 },
];

// --- scoring ---------------------------------------------------------------
export const SCORE = {
  ring: 100, // points for flying through a ring
  ringCentre: 50, // extra points for threading it dead centre
  landing: 500, // best possible touchdown, scaled by how gentle it was
  fuelPerUnit: 2, // points per unit of fuel still in the tanks
  timePerSecond: 2, // points per second under par time
  rankS: 2000,
  rankA: 1600,
  rankB: 1200,
};

// --- screens ---------------------------------------------------------------
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_OVER = 'over';
export const SCREEN_DONE = 'done';

export const KNOTS_PER_MS = 1.94384;
export const FEET_PER_M = 3.28084;
