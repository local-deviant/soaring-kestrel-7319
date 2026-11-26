// Kestrel Run — the boot, the loop and the state machine.
//
// With ?shot=<name> in the address the game stages that screenshot
// scene and draws one frame, so a screenshot is a real moment of a real
// flight. Without it, the game runs live: title, flying, pause, and the
// results, all on a fixed 1/60 s step so the simulation never depends on
// the frame rate.

import { SCREEN_DONE, SCREEN_OVER, SCREEN_PAUSE, SCREEN_PLAY, SCREEN_TITLE, STEP, VIEW_HEIGHT, VIEW_WIDTH } from './config.js';
import { createAudio, playCrash, playFanfare, playRing, playStall, playTouchdown, toggleMute, updateAudio } from './audio.js';
import { attachInput, createInput, readInput } from './input.js';
import { drawFrame } from './render.js';
import { stageShot } from './shots.js';
import { createWorld, resetWorld, stepWorld } from './world.js';

const canvas = document.getElementById('game');
const statusLine = document.getElementById('status');
const context = canvas.getContext('2d');

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || '1') || 1;
const shotName = params.get('shot');

const world = createWorld(seed);
const input = createInput();
const audio = createAudio();
let screen = SCREEN_TITLE;

function announce(text) {
  statusLine.textContent = text;
}

function soundFor(events) {
  for (const event of events) {
    if (event === 'ring') playRing(audio);
    else if (event === 'stall') playStall(audio);
    else if (event === 'touchdown') playTouchdown(audio);
    else if (event === 'crash') playCrash(audio);
    else if (event === 'done' && !world.plane.crashed) playFanfare(audio);
  }
}

function startFlying() {
  resetWorld(world);
  screen = SCREEN_PLAY;
  announce('Flying. W and S work the throttle, arrow keys pitch and bank.');
}

function restart() {
  resetWorld(world);
  screen = SCREEN_PLAY;
  announce('Flying again.');
}

// --- staged screenshots -----------------------------------------------------
if (shotName) {
  const staged = stageShot(shotName, world);
  drawFrame(context, world, staged.screen, world.plane.time);
  announce(`Kestrel Run, ${shotName} scene.`);
} else {
  // --- the live game --------------------------------------------------------
  attachInput(input, canvas, (key) => {
    if (key === 'enter' && screen === SCREEN_TITLE) startFlying();
    else if (key === 'enter' && (screen === SCREEN_OVER || screen === SCREEN_DONE)) restart();
    else if (key === 'p' && screen === SCREEN_PLAY) screen = SCREEN_PAUSE;
    else if (key === 'p' && screen === SCREEN_PAUSE) screen = SCREEN_PLAY;
    else if (key === 'r' && screen !== SCREEN_TITLE) restart();
    else if (key === 'm') toggleMute(audio);
    else if (key === 'g' && screen === SCREEN_PLAY && !world.plane.onGround) {
      world.plane.gearDown = !world.plane.gearDown;
    } else if (key === 'f' && screen === SCREEN_PLAY) {
      world.plane.flaps = (world.plane.flaps + 1) % 3;
    } else if (key === 'pointerdown' && screen === SCREEN_TITLE) {
      startFlying();
    } else if (key === 'pointerdown' && (screen === SCREEN_OVER || screen === SCREEN_DONE)) {
      restart();
    }
  });

  let lastTime = performance.now();
  let accumulator = 0;

  function frame(now) {
    const elapsed = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    if (screen === SCREEN_PLAY) {
      accumulator += elapsed;
      while (accumulator >= STEP) {
        const events = stepWorld(world, readInput(input, canvas), STEP);
        soundFor(events);
        accumulator -= STEP;
        if (world.course.finished) {
          screen = world.plane.crashed ? SCREEN_OVER : SCREEN_DONE;
          announce(world.course.finishedReason);
          break;
        }
      }
      updateAudio(audio, world.plane);
    }
    drawFrame(context, world, screen, world.plane.time);
    requestAnimationFrame(frame);
  }

  announce('Kestrel Run. Press Enter or click to fly.');
  requestAnimationFrame(frame);
}
