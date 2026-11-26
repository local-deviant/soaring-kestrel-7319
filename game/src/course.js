// The course — rings, legs, score and the shape of a sortie.
//
// A sortie is three legs in one continuous flight: take off from Runway
// A, thread eleven rings down the valley, and land on Runway B. The
// course keeps the ring states, the running score and the rank; the flight
// model keeps the aeroplane. Both are pure data, so the same inputs always
// score the same sortie.

import { COURSE, RINGS, SCORE } from './config.js';

export const LEG_TAKEOFF = 0;
export const LEG_VALLEY = 1;
export const LEG_LANDING = 2;

export function createCourse() {
  return {
    rings: RINGS.map((ring) => ({ ...ring, passed: false, hit: false, centre: 0 })),
    score: 0,
    ringsHit: 0,
    leg: LEG_TAKEOFF,
    started: false, // the clock starts at takeoff, not at the title screen
    finished: false, // wheels stopped on Runway B
    finishedReason: '',
    landingBonus: 0,
    fuelBonus: 0,
    timeBonus: 0,
  };
}

// Which leg the plane is flying, by where it is along the course.
export function legAt(z) {
  if (z < RINGS[0].z) return LEG_TAKEOFF;
  if (z < COURSE.runwayB.from - 300) return LEG_VALLEY;
  return LEG_LANDING;
}

// A ring is crossed when the plane's z passes the ring's z. A hit needs
// the plane inside the ring's circle at that moment; a near miss still
// counts as a pass for the checklist, but pays nothing.
export function checkRings(course, previousZ, plane) {
  const events = [];
  for (const ring of course.rings) {
    if (ring.passed || previousZ >= ring.z || plane.z < ring.z) continue;
    ring.passed = true;
    const dx = plane.x - ring.x;
    const dy = plane.alt - ring.alt;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= ring.radius) {
      ring.hit = true;
      ring.centre = Math.max(0, 1 - distance / ring.radius);
      const points = SCORE.ring + Math.round(SCORE.ringCentre * ring.centre);
      course.score += points;
      course.ringsHit += 1;
      events.push({ type: 'ring', points, centre: ring.centre, ring });
    } else {
      events.push({ type: 'ring-miss', ring });
    }
  }
  return events;
}

// How well the wheels kissed Runway B: gentle down, on the centreline,
// inside the touchdown zone, slow enough to stop. Each fault takes its
// share of the landing bonus.
export function scoreLanding(course, touchdown, fuelLeft, elapsed) {
  const softness = Math.max(0, 1 - touchdown.vspeed / 3.5);
  const centreline = Math.max(0, 1 - touchdown.centre / (COURSE.runwayB.width / 2));
  const inZone = touchdown.zone <= COURSE.runwayB.from + 220 ? 1 : 0.5;
  const speedOk = touchdown.speed <= 46 ? 1 : 0.6;
  const landing = Math.round(SCORE.landing * (0.35 * softness + 0.3 * centreline + 0.2 * inZone + 0.15 * speedOk));
  course.landingBonus = landing;
  course.fuelBonus = Math.round(fuelLeft * SCORE.fuelPerUnit);
  course.timeBonus = Math.max(0, Math.round((COURSE.parTime - elapsed) * SCORE.timePerSecond));
  course.score += landing + course.fuelBonus + course.timeBonus;
  return landing;
}

export function rankFor(score) {
  if (score >= SCORE.rankS) return 'S';
  if (score >= SCORE.rankA) return 'A';
  if (score >= SCORE.rankB) return 'B';
  return 'C';
}
