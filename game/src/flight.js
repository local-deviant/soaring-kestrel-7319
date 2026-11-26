// The flight model — an arcade model with real trade-offs.
//
// Speed makes lift: fly slower than the stall speed and the wing quits,
// the nose drops and the controls go mushy. Pitch trades speed for
// height, bank trades lift for a turn, and the throttle is the only thing
// that puts energy back. Fuel is the clock: burn it all and the engine
// stops, and the sortie becomes a glide.
//
// The model knows nothing about rings or missions; world.js owns those.
// It steps at a fixed 1/60 s and never reads the clock, so a replay of
// the same inputs always flies the same sortie.

import { PLANE } from './config.js';

const DEG = Math.PI / 180;

export function createPlane() {
  return {
    z: 60, // metres along the course: parked on Runway A
    x: 0, // metres off the centreline
    alt: 0, // metres above the valley floor datum
    speed: 0, // m/s
    pitch: 0, // degrees, nose up positive
    bank: 0, // degrees, right wing down positive
    heading: 0, // degrees off the runway heading
    throttle: 0, // 0..1, what the engine is doing now
    throttleTarget: 0, // 0..1, what the pilot asked for
    vspeed: 0, // m/s, climb positive
    fuel: PLANE.fuelCapacity,
    gearDown: true, // the wheels start down, on the runway
    flaps: 0, // 0, 1 or 2 notches
    onGround: true,
    crashed: false,
    crashReason: '',
    landed: false,
    touchdown: null, // { vspeed, centre, speed, zone } at the wheels' kiss
    stalled: false,
    time: 0,
  };
}

// One fixed step. `input` carries the pilot's wishes for this step:
// throttle -1/0/1, pitch -1..1, bank -1..1, brake true/false.
// `terrain` answers groundHeight(z, x) and onRunway(z, x).
// Returns an array of event strings for this step.
export function stepPlane(plane, input, terrain, dt) {
  const events = [];
  if (plane.crashed || plane.landed) return events;
  plane.time += dt;

  // The throttle lever answers at its own pace; an empty tank answers not
  // at all.
  plane.throttleTarget = Math.max(0, Math.min(1, plane.throttleTarget + input.throttle * dt * 0.9));
  if (plane.fuel <= 0) {
    if (plane.throttleTarget > 0) events.push('fuel-empty');
    plane.throttleTarget = 0;
  }
  const throttleRate = 0.7;
  plane.throttle += Math.max(-throttleRate * dt, Math.min(throttleRate * dt, plane.throttleTarget - plane.throttle));
  plane.fuel = Math.max(
    0,
    plane.fuel - (PLANE.fuelBurnIdle + (PLANE.fuelBurn - PLANE.fuelBurnIdle) * plane.throttle) * dt,
  );

  const stalled = !plane.onGround && plane.speed < PLANE.stallSpeed;
  if (stalled && !plane.stalled) events.push('stall');
  plane.stalled = stalled;
  const authority = stalled ? 0.45 : 1; // mushy controls below stall speed

  // The nose and the wings chase what the pilot asked for.
  const pitchTarget = stalled ? -6 : input.pitch * PLANE.maxPitch;
  const pitchStep = PLANE.pitchRate * authority * dt;
  plane.pitch += Math.max(-pitchStep, Math.min(pitchStep, pitchTarget - plane.pitch));
  const bankTarget = input.bank * PLANE.maxBank;
  const bankStep = PLANE.bankRate * authority * dt;
  plane.bank += Math.max(-bankStep, Math.min(bankStep, bankTarget - plane.bank));

  const dragFactor = 1 + (plane.gearDown ? PLANE.gearDrag / PLANE.drag : 0) + plane.flaps * (PLANE.flapDrag / PLANE.drag);
  const thrust = plane.throttle * PLANE.thrust;
  const drag = PLANE.drag * dragFactor * plane.speed * plane.speed;
  const alongPath = -9.81 * Math.sin(plane.pitch * DEG) * 0.8;
  plane.speed = Math.max(0, plane.speed + (thrust - drag + alongPath) * dt);

  if (plane.onGround) {
    // Rolling: the runway holds the heading, the pilot steers with bank.
    plane.heading = 0;
    plane.x = Math.max(-10, Math.min(10, plane.x + input.bank * 10 * dt * Math.min(1, plane.speed / 20)));
    plane.z += plane.speed * dt;
    plane.alt = terrain.groundHeight(plane.z, plane.x) + PLANE.gearHeight;
    plane.vspeed = 0;
    // After a touchdown the brakes stay on until the aeroplane stops.
    if (input.brake || plane.touchdown) plane.speed = Math.max(0, plane.speed - 9 * dt);
    // Rotate: fast enough and pulling back, and the valley lets go.
    // (Never again after a touchdown: the wheels stay down.)
    if (plane.speed > 30 && input.pitch > 0.3 && !plane.touchdown) {
      plane.onGround = false;
      plane.pitch = 8;
      events.push('takeoff');
    }
    return events;
  }

  // Flying: bank turns the heading — a right bank turns the nose right —
  // the heading carries the plane across the valley, and the nose sets
  // the climb.
  const turnRate = (9.81 * Math.tan(plane.bank * DEG)) / Math.max(plane.speed, 12);
  plane.heading += (turnRate / DEG) * dt;
  plane.heading = Math.max(-120, Math.min(120, plane.heading));
  const headingRad = plane.heading * DEG;
  plane.x += Math.sin(headingRad) * plane.speed * dt;
  plane.z += Math.cos(headingRad) * plane.speed * dt;

  const liftAuthority =
    Math.min(1.1, (plane.speed * plane.speed) / (PLANE.stallSpeed * PLANE.stallSpeed)) +
    plane.flaps * PLANE.flapLift;
  let targetVspeed = Math.sin(plane.pitch * DEG) * plane.speed * liftAuthority;
  if (liftAuthority < 1) targetVspeed -= (1 - liftAuthority) * 9;
  if (stalled) targetVspeed -= 5;
  plane.vspeed += Math.max(-4.0 * dt, Math.min(4.0 * dt, targetVspeed - plane.vspeed));
  plane.alt += plane.vspeed * dt;

  // The ground is the one thing that never forgives.
  const ground = terrain.groundHeight(plane.z, plane.x);
  if (plane.alt <= ground + PLANE.gearHeight) {
    const runway = terrain.onRunway(plane.z, plane.x);
    const gentle = Math.abs(plane.vspeed) <= 3.5 && plane.speed <= 46 && Math.abs(plane.heading) <= 12;
    if (runway && plane.gearDown && gentle) {
      const impactVspeed = Math.abs(plane.vspeed);
      plane.onGround = true;
      plane.alt = ground + PLANE.gearHeight;
      plane.vspeed = 0;
      plane.pitch = 0;
      plane.bank = 0;
      plane.touchdown = {
        vspeed: impactVspeed,
        centre: Math.abs(plane.x),
        speed: plane.speed,
        runway,
        zone: plane.z,
      };
      events.push('touchdown');
    } else {
      plane.crashed = true;
      plane.crashReason = !plane.gearDown && runway
        ? 'belly landing — the gear was up'
        : Math.abs(plane.vspeed) > 3.5
          ? 'hard impact — too fast down'
          : plane.speed > 46
            ? 'too fast for the runway'
            : 'into the terrain';
      events.push('crash');
    }
  }
  return events;
}
