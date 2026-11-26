// The world — one sortie, start to finish.
//
// It owns the aeroplane, the course and the valley, and steps them
// together at a fixed 1/60 s. The renderer draws what it holds, the
// autopilot flies it, and the screenshot stager replays it: all three read
// the same state, so a staged screenshot is a real moment of a real
// flight, never a painting.

import { COURSE, STEP } from './config.js';
import { createCourse, checkRings, legAt, scoreLanding, LEG_TAKEOFF } from './course.js';
import { createPlane, stepPlane } from './flight.js';
import { createTerrain } from './terrain.js';

export { STEP };

export function createWorld(seed) {
  const terrain = createTerrain(seed);
  return {
    seed,
    terrain,
    plane: createPlane(),
    course: createCourse(),
    takeoffTime: 0,
    messages: [], // { text, until } shown on the HUD for a few seconds
  };
}

export function resetWorld(world) {
  const fresh = createWorld(world.seed);
  world.terrain = fresh.terrain;
  world.plane = fresh.plane;
  world.course = fresh.course;
  world.takeoffTime = 0;
  world.messages = [];
}

function say(world, text, seconds) {
  world.messages.push({ text, until: world.plane.time + seconds });
}

// One fixed step. Returns the events of this step (rings, takeoff,
// touchdown, crash, finish) for the caller to sound or log.
export function stepWorld(world, input, dt) {
  const { plane, course, terrain } = world;
  if (course.finished) return [];
  // The autopilot (and only the autopilot) names the gear and flap states
  // it wants; the keyboard path toggles them directly instead.
  if (typeof input.gearDown === 'boolean') plane.gearDown = input.gearDown;
  if (typeof input.flaps === 'number') plane.flaps = input.flaps;
  const previousZ = plane.z;
  const events = stepPlane(plane, input, terrain, dt);

  for (const event of events) {
    if (event === 'takeoff') {
      course.started = true;
      world.takeoffTime = plane.time;
      say(world, 'AIRBORNE — GEAR UP WHEN CLEAR', 4);
    }
    if (event === 'stall') say(world, 'STALL — NOSE DOWN, POWER UP', 3);
    if (event === 'fuel-empty') say(world, 'FUEL EMPTY — GLIDING', 5);
    if (event === 'crash') {
      course.finished = true;
      course.finishedReason = `crashed — ${plane.crashReason}`;
    }
  }

  const ringEvents = checkRings(course, previousZ, plane);
  for (const ringEvent of ringEvents) {
    events.push(ringEvent.type);
    if (ringEvent.type === 'ring') {
      say(world, `RING +${ringEvent.points}`, 2);
    } else {
      say(world, 'RING MISSED', 2);
    }
  }

  course.leg = legAt(plane.z);

  // Touchdown starts the rollout: the wheels are down, the lever is shut,
  // the brakes are on, and the sortie ends when the aeroplane stops.
  if (plane.touchdown && !plane.landed) {
    plane.throttleTarget = 0;
    plane.throttle = Math.max(0, plane.throttle - 1.5 * dt);
    plane.speed = Math.max(0, plane.speed - 9 * dt);
    if (plane.speed < 2) {
      plane.landed = true;
      course.finished = true;
      if (plane.touchdown.runway === 'B') {
        const elapsed = plane.time - world.takeoffTime;
        scoreLanding(course, plane.touchdown, plane.fuel, elapsed);
        course.finishedReason = 'landed — sortie complete';
      } else {
        course.finishedReason = 'landed back at base';
      }
      events.push('done');
    }
  }

  // Flying past the far runway without landing ends the sortie too.
  if (!course.finished && plane.z > COURSE.finishZ + 800) {
    course.finished = true;
    course.finishedReason = 'flew past Runway B';
    events.push('done');
  }

  return events;
}
