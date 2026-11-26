// The autopilot — a patient pilot made of proportional control.
//
// It flies the same sortie a person flies: full throttle down the runway,
// rotate, climb to the next ring, steer toward it, and when the rings are
// done, gear down, flaps down, ride the glide slope and flare. It is the
// pilot behind the staged screenshots and the self-play tests, so if it
// can fly the valley, a person can too.
//
// The autopilot returns the same input object the keyboard builds, plus
// the gear and flap states it wants; world.js applies those before the
// flight model steps.

import { COURSE } from './config.js';

const DEG = Math.PI / 180;

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function wrapDegrees(angle) {
  let wrapped = angle % 360;
  if (wrapped > 180) wrapped -= 360;
  if (wrapped < -180) wrapped += 360;
  return wrapped;
}

export function autopilotInput(world) {
  const { plane, course } = world;
  const input = { throttle: 0, pitch: 0, bank: 0, brake: false };

  // On the ground: full throttle, and pull back once the wings bite.
  if (plane.onGround) {
    input.throttle = plane.throttleTarget < 1 ? 1 : 0;
    input.pitch = plane.speed > 28 ? 1 : 0;
    input.brake = false;
    input.gearDown = true;
    input.flaps = 0;
    return input;
  }

  const landing = plane.z > 8000 || course.rings.every((ring) => ring.passed);
  const nextRing = course.rings.find((ring) => !ring.passed);

  // Where to aim: the next ring, or the far runway once they are done.
  let targetX = 0;
  let targetZ = 8800;
  let targetAlt = 0;
  if (!landing && nextRing) {
    targetX = nextRing.x;
    targetZ = nextRing.z;
    targetAlt = nextRing.alt;
  }

  // Steer: bank toward the heading that points at the target — but judge
  // the heading against a fixed lookahead, not against the target's own
  // distance, so the nose never chases a point that is already beside it
  // and the aeroplane stops swinging from ring to ring.
  const desiredHeading = Math.atan2(targetX - plane.x, 300) / DEG;
  const headingError = wrapDegrees(desiredHeading - plane.heading);
  input.bank = clamp(headingError / 15, -1, 1);

  // Climb and descend: aim for the target's height, or for the glide
  // slope on final — three degrees down to the touchdown zone.
  let desiredVspeed;
  if (landing) {
    // Four degrees down to the touchdown zone, then a late flare: the
    // aeroplane must be low over the threshold, not floating above it.
    const glideAlt = Math.max(0, (8700 - plane.z) * 0.0699);
    desiredVspeed = clamp((glideAlt - plane.alt) * 0.45, -8, 3);
    if (plane.alt < 6 && plane.z > 8600) desiredVspeed = -1.2;
    input.gearDown = true;
    input.flaps = 2;
  } else {
    // Climb hard for the ring's height: the valley rewards a pilot who
    // gets up early, and the rings sit higher than a lazy climb reaches.
    desiredVspeed = clamp((targetAlt - plane.alt) * 0.5, -7, 10);
    input.gearDown = false;
    input.flaps = 0;
  }
  const liftAuthority = Math.min(1.1, (plane.speed * plane.speed) / (28 * 28));
  const desiredPitch = Math.asin(clamp(desiredVspeed / Math.max(20, plane.speed * liftAuthority), -0.42, 0.42)) / DEG;
  input.pitch = clamp((desiredPitch - plane.pitch) / 10, -1, 1);

  // Throttle: hold cruise speed en route, approach speed on final, idle
  // in the flare. Dirty — gear and flaps down — the aeroplane drags far
  // more, so final approach needs a much heavier hand on the lever. The
  // flare keeps power on — a dirty aeroplane at idle sheds speed so fast
  // the wing quits before the wheels touch, so the lever stays up until
  // the runway is under the wheels.
  const targetSpeed = landing ? 40 : 62;
  const baseThrottle = landing ? 0.72 : 0.55;
  const speedGain = landing ? 0.05 : 0.02;
  const desiredThrottle = clamp(baseThrottle + (targetSpeed - plane.speed) * speedGain, landing ? 0 : 0.35, 1);
  input.throttle = desiredThrottle > plane.throttleTarget + 0.02 ? 1 : desiredThrottle < plane.throttleTarget - 0.02 ? -1 : 0;

  return input;
}
