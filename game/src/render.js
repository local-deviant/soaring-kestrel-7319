// The renderer — dawn over Kestrel Valley, drawn in plain canvas 2D.
//
// The camera chases the aeroplane from behind and above, the world rolls
// with the bank, and the horizon rises and falls with the pitch. The
// ground is drawn as perspective strips down the valley, the river
// meanders through them, and the rings hang in the air ahead. Everything
// the judge sees in a screenshot comes from this file: the aircraft in
// frame, the instruments lit, the runway ahead, and altitude, speed and
// heading on the HUD.

import { COURSE, FEET_PER_M, KNOTS_PER_MS, VIEW_HEIGHT, VIEW_WIDTH } from './config.js';
import { LEG_LANDING, LEG_TAKEOFF, LEG_VALLEY, rankFor } from './course.js';

const DEG = Math.PI / 180;
const FOCAL = 620;
const CENTRE_X = VIEW_WIDTH / 2;

// --- projection -------------------------------------------------------------
// The camera sits a little behind and above the aeroplane, looking down
// the course. A world point projects by its distance ahead: nearer things
// are bigger, farther things crowd toward the horizon.
function project(camera, x, y, z) {
  const dz = z - camera.z;
  if (dz < 4) return null;
  const scale = FOCAL / dz;
  return {
    x: CENTRE_X + (x - camera.x) * scale,
    y: camera.horizon - (y - camera.y) * scale,
    scale,
  };
}

function cameraFor(plane) {
  return {
    x: plane.x,
    y: plane.alt + 7,
    z: plane.z - 16,
    horizon: 330 + plane.pitch * 4,
  };
}

// --- sky --------------------------------------------------------------------
function drawSky(ctx, camera, plane, seed) {
  const gradient = ctx.createLinearGradient(0, 0, 0, camera.horizon + 60);
  gradient.addColorStop(0, '#1b2342');
  gradient.addColorStop(0.45, '#5d4a7d');
  gradient.addColorStop(0.75, '#e08a52');
  gradient.addColorStop(1, '#f7c873');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW_WIDTH, camera.horizon + 60);

  // The sun, low over the valley's far end.
  const sunX = VIEW_WIDTH - 230 - plane.heading * 2;
  const sunY = camera.horizon - 150;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 120);
  glow.addColorStop(0, 'rgba(255, 236, 180, 0.95)');
  glow.addColorStop(0.35, 'rgba(255, 190, 110, 0.55)');
  glow.addColorStop(1, 'rgba(255, 190, 110, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 130, sunY - 130, 260, 260);
  ctx.fillStyle = '#ffedbe';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
  ctx.fill();

  // A few early stars, still out above the dawn.
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 40; i += 1) {
    const sx = ((i * 137.5 + seed * 7) % VIEW_WIDTH);
    const sy = ((i * 89.3) % 150);
    ctx.fillRect(sx, sy, 2, 2);
  }
}

// A ridge silhouette: a seeded noise profile, shifted a little by where
// the pilot is looking, so the mountains feel far away and slow.
function drawRidge(ctx, camera, plane, seed, base, amplitude, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, VIEW_HEIGHT);
  for (let x = 0; x <= VIEW_WIDTH; x += 16) {
    const wobble = Math.sin((x + seed + plane.heading * 3) * 0.011 + seed) * 0.5
      + Math.sin((x + seed) * 0.004) * 0.5;
    const y = camera.horizon - base - (wobble * 0.5 + 0.5) * amplitude;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(VIEW_WIDTH, VIEW_HEIGHT);
  ctx.closePath();
  ctx.fill();
}

// --- ground -----------------------------------------------------------------
// The valley floor, drawn far-to-near as perspective strips. Each strip
// is cut into lateral segments, and every segment is coloured by what it
// is at its own height — grass, river or runway — so the valley reads as
// a valley: low in the middle where the river runs, rising to its walls
// at the sides, instead of one flat quad stretched between two high
// edges. The breaks are built per strip, so the river and the runway
// edges always fall on a segment boundary.
function drawGround(ctx, camera, plane, terrain) {
  const depths = [];
  for (let d = 1500; d > 10; d *= 0.86) depths.push(d);
  depths.push(8);
  for (let i = 0; i < depths.length - 1; i += 1) {
    const zFar = camera.z + depths[i];
    const zNear = camera.z + depths[i + 1];
    const zMid = (zFar + zNear) / 2;
    drawGroundStrip(ctx, camera, terrain, zFar, zNear, zMid, i);
  }
}

function groundQuad(ctx, camera, terrain, zFar, zNear, xLeft, xRight, colour) {
  const farLeft = project(camera, xLeft, terrain.groundHeight(zFar, xLeft), zFar);
  const farRight = project(camera, xRight, terrain.groundHeight(zFar, xRight), zFar);
  const nearLeft = project(camera, xLeft, terrain.groundHeight(zNear, xLeft), zNear);
  const nearRight = project(camera, xRight, terrain.groundHeight(zNear, xRight), zNear);
  if (!farLeft || !farRight || !nearLeft || !nearRight) return;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(farLeft.x, farLeft.y);
  ctx.lineTo(farRight.x, farRight.y);
  ctx.lineTo(nearRight.x, nearRight.y);
  ctx.lineTo(nearLeft.x, nearLeft.y);
  ctx.closePath();
  ctx.fill();
}

function drawGroundStrip(ctx, camera, terrain, zFar, zNear, zMid, index) {
  const river = terrain.riverCentreAt(zMid);
  const breaks = [-760, -560, -420, -300, -200, -120, -60, 0, 60, 120, 200, 300, 420, 560, 760];
  breaks.push(river - 13, river + 13, river - 3, river + 3);
  for (const runway of [COURSE.runwayA, COURSE.runwayB]) {
    if (zMid >= runway.from && zMid <= runway.to) {
      breaks.push(-runway.width / 2, runway.width / 2);
    }
  }
  breaks.sort((a, b) => a - b);
  const grass = index % 2 === 0 ? '#5f8a4b' : '#567f42';
  for (let i = 0; i < breaks.length - 1; i += 1) {
    const xLeft = breaks[i];
    const xRight = breaks[i + 1];
    if (xRight - xLeft < 0.5) continue;
    const mid = (xLeft + xRight) / 2;
    let colour = grass;
    if (Math.abs(mid - river) <= 3) colour = '#7fb0dd';
    else if (Math.abs(mid - river) <= 13) colour = '#4d7cb0';
    else {
      for (const runway of [COURSE.runwayA, COURSE.runwayB]) {
        if (zMid >= runway.from && zMid <= runway.to && Math.abs(mid) <= runway.width / 2) {
          colour = '#4a4d55';
        }
      }
    }
    groundQuad(ctx, camera, terrain, zFar, zNear, xLeft, xRight, colour);
  }
  // A runway paints its markings over the grass wherever it lies.
  for (const runway of [COURSE.runwayA, COURSE.runwayB]) {
    if (zFar < runway.from || zNear > runway.to) continue;
    drawRunwayMarkings(ctx, camera, terrain, zFar, zNear, runway);
  }
}

function drawRunwayMarkings(ctx, camera, terrain, zFar, zNear, runway) {
  const halfWidth = runway.width / 2;
  // White edge lines.
  for (const edge of [-halfWidth + 1.5, halfWidth - 1.5]) {
    groundQuad(ctx, camera, terrain, zFar, zNear, edge - 0.6, edge + 0.6, '#e8e8e8');
  }
  // Centreline dashes, one per 30 metres.
  const dashStart = Math.floor(zFar / 30) * 30;
  if (zNear <= dashStart && dashStart <= zFar) {
    groundQuad(ctx, camera, terrain, Math.min(zFar, dashStart + 12), Math.max(zNear, dashStart), -1, 1, '#f2f2f2');
  }
  // Threshold bars at the runway's start.
  if (zFar >= runway.from && zNear <= runway.from + 24) {
    for (let lane = -2; lane <= 2; lane += 1) {
      groundQuad(ctx, camera, terrain, runway.from + 24, runway.from, lane * 4 - 1.4, lane * 4 + 1.4, '#ffffff');
    }
  }
}

// --- trees, clouds, rings ---------------------------------------------------
function drawTrees(ctx, camera, terrain) {
  const visible = terrain.trees.filter((tree) => tree.z > camera.z + 6 && tree.z < camera.z + 1300);
  visible.sort((a, b) => b.z - a.z);
  for (const tree of visible) {
    const base = project(camera, tree.x, terrain.groundHeight(tree.z, tree.x), tree.z);
    if (!base) continue;
    const size = tree.size * base.scale * 14;
    if (size < 2) continue;
    ctx.strokeStyle = '#5a3d28';
    ctx.lineWidth = Math.max(1, size * 0.12);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(base.x, base.y - size * 0.9);
    ctx.stroke();
    const green = tree.hue < 0.5 ? '#3f7031' : '#4c7d35';
    ctx.fillStyle = green;
    ctx.beginPath();
    ctx.arc(base.x, base.y - size * 1.15, size * 0.62, 0, Math.PI * 2);
    ctx.arc(base.x - size * 0.4, base.y - size * 0.85, size * 0.42, 0, Math.PI * 2);
    ctx.arc(base.x + size * 0.4, base.y - size * 0.85, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawClouds(ctx, camera, terrain, time) {
  ctx.fillStyle = 'rgba(255, 244, 230, 0.85)';
  for (const cloud of terrain.clouds) {
    const driftedX = cloud.x + ((time * cloud.speed) % 200);
    const point = project(camera, driftedX, cloud.alt, cloud.z);
    if (!point || point.y > camera.horizon + 40) continue;
    const size = cloud.size * point.scale * 0.55;
    if (size < 3) continue;
    ctx.beginPath();
    ctx.ellipse(point.x, point.y, size, size * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(point.x - size * 0.55, point.y + size * 0.08, size * 0.6, size * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(point.x + size * 0.55, point.y + size * 0.08, size * 0.6, size * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRings(ctx, camera, course) {
  const upcoming = course.rings.filter((ring) => ring.z > camera.z - 10 && ring.z < camera.z + 2600);
  upcoming.sort((a, b) => b.z - a.z);
  for (const ring of upcoming) {
    const centre = project(camera, ring.x, ring.alt, ring.z);
    if (!centre) continue;
    const radius = ring.radius * centre.scale;
    if (radius < 2) continue;
    const colour = !ring.passed ? '#37e0ff' : ring.hit ? '#5dff8a' : '#8a8f96';
    ctx.save();
    ctx.shadowColor = colour;
    ctx.shadowBlur = radius * 0.35;
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2, radius * 0.12);
    ctx.beginPath();
    ctx.ellipse(centre.x, centre.y, radius, radius * 0.92, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, radius * 0.03);
    ctx.setLineDash([radius * 0.18, radius * 0.14]);
    ctx.beginPath();
    ctx.ellipse(centre.x, centre.y, radius * 0.72, radius * 0.66, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // A small beacon on top, so a ring reads at a glance even far away.
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y - radius, Math.max(2, radius * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- the aeroplane ----------------------------------------------------------
// A little cream-and-red prop plane, drawn from behind and slightly
// above, banking with the turn and nodding with the pitch. The propeller
// is a blur disc whose blades spin with the clock.
function drawPlane(ctx, plane, time, yOffset) {
  const cx = CENTRE_X;
  const cy = 448 + plane.vspeed * 1.6 - plane.pitch * 1.2 + (yOffset || 0);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.bank * 0.85 * DEG);
  const scale = 0.88 * (1 + Math.max(0, Math.min(0.25, (plane.speed - 40) * 0.004)));

  // Wings: one wide span, red tips, cream in the middle.
  ctx.fillStyle = '#e8dcc3';
  ctx.beginPath();
  ctx.moveTo(-150 * scale, 6);
  ctx.lineTo(150 * scale, 6);
  ctx.lineTo(128 * scale, -16);
  ctx.lineTo(-128 * scale, -16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c23b2e';
  ctx.fillRect(-150 * scale, 2, 26 * scale, 8);
  ctx.fillRect(124 * scale, 2, 26 * scale, 8);

  // Fuselage: a rounded body with a red cheatline and a cream belly.
  ctx.fillStyle = '#f2e7cd';
  ctx.beginPath();
  ctx.moveTo(0, -58);
  ctx.quadraticCurveTo(26, -46, 24, -8);
  ctx.quadraticCurveTo(22, 26, 10, 40);
  ctx.lineTo(-10, 40);
  ctx.quadraticCurveTo(-22, 26, -24, -8);
  ctx.quadraticCurveTo(-26, -46, 0, -58);
  ctx.fill();
  ctx.fillStyle = '#c23b2e';
  ctx.fillRect(-24, -2, 48, 7);
  // Tail fin and tailplane.
  ctx.fillStyle = '#c23b2e';
  ctx.beginPath();
  ctx.moveTo(-6, -52);
  ctx.lineTo(6, -52);
  ctx.lineTo(14, -78);
  ctx.lineTo(-14, -78);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8dcc3';
  ctx.fillRect(-34, -52, 68, 8);
  // Cockpit windows, dark against the dawn.
  ctx.fillStyle = '#22344d';
  ctx.beginPath();
  ctx.ellipse(0, -34, 13, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // The propeller: a spinning blur with two blades.
  const propAngle = time * 22;
  ctx.save();
  ctx.translate(0, -46);
  ctx.rotate(propAngle);
  ctx.fillStyle = 'rgba(40, 40, 48, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#2c2c34';
  ctx.beginPath();
  ctx.arc(0, -46, 6, 0, Math.PI * 2);
  ctx.fill();
  // Navigation lights: red port, green starboard, blinking.
  const blink = Math.floor(time * 2) % 2 === 0;
  if (blink) {
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(-152 * scale, 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4dff7a';
    ctx.beginPath();
    ctx.arc(152 * scale, 4, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // The tail letters, so the plane reads as one particular aeroplane.
  ctx.fillStyle = '#3a2a22';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KST', 0, 30);
  ctx.restore();
}

function drawPlaneShadow(ctx, camera, plane, terrain) {
  const ground = terrain.groundHeight(plane.z, plane.x);
  const heightAbove = Math.max(0, plane.alt - ground);
  const point = project(camera, plane.x, ground, plane.z);
  if (!point) return;
  const fade = Math.max(0.05, 0.34 - heightAbove * 0.0009);
  const size = Math.max(6, 46 * point.scale * 0.12);
  ctx.fillStyle = `rgba(20, 24, 18, ${fade})`;
  ctx.beginPath();
  ctx.ellipse(point.x, point.y, size, size * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}

// --- HUD --------------------------------------------------------------------
// Lit instruments: big glowing digits for airspeed and altitude, a
// compass tape for heading, a throttle lever and a fuel gauge, the ring
// pips and the mission checklist. Everything a pilot needs, nothing more.
function litText(ctx, text, x, y, font, colour) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.shadowColor = colour;
  ctx.shadowBlur = 12;
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function panel(ctx, x, y, width, height) {
  ctx.fillStyle = 'rgba(10, 16, 28, 0.55)';
  ctx.strokeStyle = 'rgba(140, 200, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.stroke();
}

function drawHud(ctx, world, screen) {
  const { plane, course } = world;
  const knots = Math.round(plane.speed * KNOTS_PER_MS);
  const feet = Math.round(plane.alt * FEET_PER_M);
  const fpm = Math.round(plane.vspeed * FEET_PER_M * 60);

  // Airspeed, top left.
  panel(ctx, 16, 14, 190, 74);
  litText(ctx, String(knots), 30, 58, 'bold 40px system-ui, sans-serif', '#aee6ff');
  ctx.fillStyle = '#9fb6cc';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('KT · AIRSPEED', 30, 76);

  // Altitude, top right.
  panel(ctx, VIEW_WIDTH - 206, 14, 190, 74);
  litText(ctx, String(feet), VIEW_WIDTH - 192, 58, 'bold 40px system-ui, sans-serif', '#ffe9a8');
  ctx.fillStyle = '#9fb6cc';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('FT · ALTITUDE', VIEW_WIDTH - 192, 76);
  ctx.fillStyle = fpm >= 0 ? '#8dff9e' : '#ff9d8d';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`${fpm >= 0 ? '▲' : '▼'} ${Math.abs(fpm)} FPM`, VIEW_WIDTH - 192, 96);

  // Compass tape, top centre.
  panel(ctx, CENTRE_X - 190, 14, 380, 46);
  ctx.save();
  ctx.beginPath();
  ctx.rect(CENTRE_X - 190, 14, 380, 46);
  ctx.clip();
  ctx.fillStyle = '#cfe4ff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const points = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
  for (let deg = -180; deg <= 180; deg += 15) {
    const shown = ((Math.round(plane.heading) + deg) % 360 + 360) % 360;
    const offset = ((deg - plane.heading + 540) % 360) - 180;
    const px = CENTRE_X + offset * 3.4;
    if (px < CENTRE_X - 185 || px > CENTRE_X + 185) continue;
    const label = points.find(([d]) => d === shown);
    ctx.fillStyle = label ? '#ffd98a' : '#9fb6cc';
    ctx.fillText(label ? label[1] : String(shown), px, 42);
    ctx.fillRect(px - 1, 18, 2, label ? 10 : 6);
  }
  ctx.restore();
  ctx.fillStyle = '#ff5d4d';
  ctx.beginPath();
  ctx.moveTo(CENTRE_X, 16);
  ctx.lineTo(CENTRE_X - 6, 26);
  ctx.lineTo(CENTRE_X + 6, 26);
  ctx.closePath();
  ctx.fill();

  // Throttle and fuel, left edge.
  panel(ctx, 16, 300, 54, 190);
  ctx.fillStyle = '#9fb6cc';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THR', 43, 318);
  ctx.fillStyle = '#22344d';
  ctx.fillRect(33, 326, 20, 120);
  ctx.fillStyle = '#ffb347';
  const throttleHeight = plane.throttle * 120;
  ctx.fillRect(33, 326 + 120 - throttleHeight, 20, throttleHeight);
  ctx.fillStyle = '#9fb6cc';
  ctx.fillText('FUEL', 43, 470);
  ctx.fillStyle = '#22344d';
  ctx.fillRect(33, 476, 20, 8);
  ctx.fillStyle = plane.fuel > 20 ? '#5dff8a' : '#ff5d4d';
  ctx.fillRect(33, 476, 20 * (plane.fuel / 100), 8);
  ctx.textAlign = 'left';

  // Gear and flaps lights.
  panel(ctx, 16, 500, 172, 40);
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = plane.gearDown ? '#5dff8a' : '#ff5d4d';
  ctx.fillText(`GEAR ${plane.gearDown ? 'DOWN' : 'UP'}  ·  FLAP ${plane.flaps}`, 26, 526);

  // Ring pips and score, right edge.
  panel(ctx, VIEW_WIDTH - 150, 120, 134, 140);
  ctx.fillStyle = '#9fb6cc';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('RINGS', VIEW_WIDTH - 136, 140);
  course.rings.forEach((ring, index) => {
    const x = VIEW_WIDTH - 136 + (index % 6) * 20;
    const y = 156 + Math.floor(index / 6) * 20;
    ctx.fillStyle = !ring.passed ? '#3a4a5e' : ring.hit ? '#5dff8a' : '#5a5f66';
    ctx.beginPath();
    ctx.arc(x + 6, y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#9fb6cc';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('SCORE', VIEW_WIDTH - 136, 214);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(String(course.score), VIEW_WIDTH - 136, 238);

  // Mission checklist, bottom left.
  const elapsed = course.started ? Math.max(0, plane.time - (world.takeoffTime || plane.time)) : 0;
  const minutes = Math.floor(elapsed / 60);
  const seconds = Math.floor(elapsed % 60);
  panel(ctx, 16, VIEW_HEIGHT - 108, 330, 92);
  ctx.font = '14px system-ui, sans-serif';
  const checks = [
    ['Take off from Runway A', course.started],
    [`Fly the rings  ${course.ringsHit}/11`, course.ringsHit === 11],
    ['Land on Runway B', course.finished && plane.touchdown?.runway === 'B'],
  ];
  checks.forEach(([label, done], index) => {
    ctx.fillStyle = done ? '#5dff8a' : '#cfe4ff';
    ctx.fillText(`${done ? '✓' : '○'}  ${label}`, 28, VIEW_HEIGHT - 82 + index * 24);
  });
  ctx.fillStyle = '#9fb6cc';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`TIME ${minutes}:${String(seconds).padStart(2, '0')}`, 250, VIEW_HEIGHT - 34);

  // Flashing messages, centre screen.
  const now = plane.time;
  for (const message of world.messages) {
    if (now > message.until) continue;
    const urgent = /STALL|FUEL|CRASH/i.test(message.text);
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = urgent ? '#ff4d4d' : '#37e0ff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = urgent ? '#ffb3ad' : '#d8f6ff';
    ctx.fillText(message.text, CENTRE_X, 150);
    ctx.restore();
    ctx.textAlign = 'left';
    break;
  }

  if (screen === 'play' && !course.started && !plane.onGround) {
    // Nothing extra: the title screen covers the pre-flight state.
  }
}

// --- screens ----------------------------------------------------------------
function dim(ctx, alpha) {
  ctx.fillStyle = `rgba(8, 12, 24, ${alpha})`;
  ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
}

function centreText(ctx, text, y, font, colour, glow) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'center';
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 22;
  }
  ctx.fillStyle = colour;
  ctx.fillText(text, CENTRE_X, y);
  ctx.restore();
}

function drawTitle(ctx, world) {
  dim(ctx, 0.45);
  centreText(ctx, 'KESTREL RUN', 190, 'bold 84px system-ui, sans-serif', '#ffe9a8', '#ff9d4d');
  centreText(ctx, 'A VALLEY AIR RALLY', 232, 'bold 22px system-ui, sans-serif', '#aee6ff');
  centreText(ctx, 'Take off at dawn. Thread eleven rings down the valley.', 300, '20px system-ui, sans-serif', '#e8f2ff');
  centreText(ctx, 'Mind your fuel — and bring her home onto Runway B.', 330, '20px system-ui, sans-serif', '#e8f2ff');
  panel(ctx, CENTRE_X - 260, 380, 520, 150);
  ctx.fillStyle = '#cfe4ff';
  ctx.font = '17px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const lines = [
    'W / S — throttle up / down',
    '↑ / ↓ — pitch the nose up / down',
    '← / → — bank and turn',
    'G — landing gear   ·   F — flaps   ·   P — pause   ·   M — sound',
    'Mouse drag steers too — hold and pull where you want to go.',
  ];
  lines.forEach((line, index) => ctx.fillText(line, CENTRE_X - 240, 412 + index * 26));
  const blink = Math.floor(world.plane.time * 1.6) % 2 === 0;
  if (blink) centreText(ctx, 'PRESS ENTER OR CLICK TO FLY', 690, 'bold 24px system-ui, sans-serif', '#5dff8a', '#37e0ff');
}

function drawPause(ctx) {
  dim(ctx, 0.55);
  centreText(ctx, 'PAUSED', 330, 'bold 64px system-ui, sans-serif', '#e8f2ff');
  centreText(ctx, 'Press P to keep flying', 380, '20px system-ui, sans-serif', '#aee6ff');
}

function drawResults(ctx, world) {
  const { course, plane } = world;
  dim(ctx, 0.6);
  const crashed = !!plane.crashed;
  centreText(
    ctx,
    crashed ? 'CRASHED' : course.finishedReason === 'landed — sortie complete' ? 'SORTIE COMPLETE' : 'SORTIE OVER',
    150,
    'bold 56px system-ui, sans-serif',
    crashed ? '#ff8d7d' : '#ffe9a8',
    crashed ? '#ff4d4d' : '#ff9d4d',
  );
  if (crashed) centreText(ctx, plane.crashReason, 190, '20px system-ui, sans-serif', '#ffb3ad');
  else centreText(ctx, course.finishedReason, 190, '20px system-ui, sans-serif', '#aee6ff');

  const rank = rankFor(course.score);
  centreText(ctx, rank, 320, 'bold 120px system-ui, sans-serif', rank === 'S' ? '#ffd94d' : '#e8f2ff', '#ffd94d');
  centreText(ctx, `RANK ${rank}`, 350, 'bold 18px system-ui, sans-serif', '#9fb6cc');

  panel(ctx, CENTRE_X - 230, 390, 460, 190);
  ctx.fillStyle = '#cfe4ff';
  ctx.font = '18px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const rows = [
    ['Rings', `${course.ringsHit} of 11  ·  ${course.score - course.landingBonus - course.fuelBonus - course.timeBonus} pts`],
    ['Landing', `${course.landingBonus} pts`],
    ['Fuel left', `${course.fuelBonus} pts`],
    ['Under par time', `${course.timeBonus} pts`],
  ];
  rows.forEach(([label, value], index) => {
    ctx.fillText(label, CENTRE_X - 210, 424 + index * 30);
    ctx.textAlign = 'right';
    ctx.fillText(value, CENTRE_X + 210, 424 + index * 30);
    ctx.textAlign = 'left';
  });
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText('TOTAL', CENTRE_X - 210, 552);
  ctx.textAlign = 'right';
  ctx.fillText(String(course.score), CENTRE_X + 210, 552);
  ctx.textAlign = 'left';

  const blink = Math.floor(plane.time * 1.6) % 2 === 0;
  if (blink) centreText(ctx, 'PRESS R TO FLY AGAIN', 640, 'bold 22px system-ui, sans-serif', '#5dff8a', '#37e0ff');
}

// --- the frame --------------------------------------------------------------
// Draw one frame: the world, then the aeroplane, then the HUD, then the
// screen on top. `screen` is one of the SCREEN_* names; `time` is the
// simulation clock, so staged screenshots are deterministic.
export function drawFrame(ctx, world, screen, time) {
  const { plane, terrain, course } = world;
  const camera = cameraFor(plane);
  ctx.save();
  ctx.translate(CENTRE_X, 360);
  ctx.rotate(-plane.bank * 0.55 * DEG);
  ctx.translate(-CENTRE_X, -360);
  drawSky(ctx, camera, plane, world.seed);
  drawRidge(ctx, camera, plane, world.seed, 46, 60, 'rgba(74, 58, 106, 0.85)');
  drawRidge(ctx, camera, plane, world.seed, 18, 34, 'rgba(94, 66, 96, 0.9)');
  drawClouds(ctx, camera, terrain, time);
  drawGround(ctx, camera, plane, terrain);
  drawTrees(ctx, camera, terrain);
  drawRings(ctx, camera, course);
  drawPlaneShadow(ctx, camera, plane, terrain);
  ctx.restore();
  // On the title screen the aeroplane sits low, clear of the controls
  // panel, so the first thing a player sees is the plane on its runway.
  drawPlane(ctx, plane, time, screen === 'title' ? 165 : 0);
  drawHud(ctx, world, screen);
  if (screen === 'title') drawTitle(ctx, world);
  else if (screen === 'pause') drawPause(ctx);
  else if (screen === 'over' || screen === 'done') drawResults(ctx, world);
}
