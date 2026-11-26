// The screenshot scenes behind ?shot=start|play|landing|end.
//
// Each one plays the real rules forward from a fresh world, steered by
// the autopilot, so the frame is what a real flight looks like at that
// moment and the same seed always gives the same frame. Nothing here is
// painted for the camera: the game renders the staged state exactly as
// it renders a live one.

import { SCREEN_DONE, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, STEP } from './config.js';
import { autopilotInput } from './autopilot.js';
import { resetWorld, stepWorld } from './world.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 55;
const LANDING_LIMIT_SECONDS = 300;
const END_LIMIT_SECONDS = 600;

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Unknown names stage the title, as the game opens on it.
 */
export function stageShot(name, world) {
  resetWorld(world);
  const idle = { throttle: 0, pitch: 0, bank: 0, brake: false };
  if (name !== 'play' && name !== 'landing' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      stepWorld(world, idle, STEP);
    }
    return { screen: SCREEN_TITLE };
  }
  if (name === 'play') {
    for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
      stepWorld(world, autopilotInput(world), STEP);
    }
    return { screen: SCREEN_PLAY };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : LANDING_LIMIT_SECONDS;
  for (let index = 0; index < limit / STEP; index += 1) {
    stepWorld(world, autopilotInput(world), STEP);
    if (name === 'landing') {
      const { plane, course } = world;
      if (plane.z > 8200 && plane.alt < 160 && !plane.onGround) break;
    }
    if (name === 'end' && world.course.finished) break;
  }
  if (name === 'end') {
    return { screen: world.plane.crashed ? SCREEN_OVER : SCREEN_DONE };
  }
  return { screen: SCREEN_PLAY };
}
