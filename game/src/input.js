// Input — keyboard and mouse, both steering the same aeroplane.
//
// The keyboard is the primary control: W/S work the throttle, the arrows
// work the nose and the wings, G and F work the gear and the flaps. The
// mouse is a second yoke: hold the button and drag, and the aeroplane
// banks and pitches toward where the pointer sits. Either way the pilot
// gets the same input object every frame, so the simulation never knows
// which hand flew it.

export function createInput() {
  return {
    keys: new Set(),
    pointer: { active: false, x: 0, y: 0 },
    // One-shot actions the game loop consumes and clears.
    pressed: new Set(),
  };
}

export function attachInput(input, canvas, onAction) {
  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
    if (!event.repeat) {
      input.pressed.add(event.key.toLowerCase());
      onAction(event.key.toLowerCase());
    }
    input.keys.add(event.key.toLowerCase());
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.key.toLowerCase());
  });
  canvas.addEventListener('pointerdown', (event) => {
    input.pointer.active = true;
    input.pointer.x = event.clientX;
    input.pointer.y = event.clientY;
    onAction('pointerdown');
  });
  window.addEventListener('pointermove', (event) => {
    if (!input.pointer.active) return;
    input.pointer.x = event.clientX;
    input.pointer.y = event.clientY;
  });
  window.addEventListener('pointerup', () => {
    input.pointer.active = false;
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.pointer.active = false;
  });
}

// Read the pilot's wishes for this frame from the keys and the pointer.
export function readInput(input, canvas) {
  const keys = input.keys;
  let throttle = 0;
  if (keys.has('w')) throttle += 1;
  if (keys.has('s')) throttle -= 1;
  let pitch = 0;
  if (keys.has('arrowup')) pitch += 1;
  if (keys.has('arrowdown')) pitch -= 1;
  let bank = 0;
  if (keys.has('arrowleft')) bank -= 1;
  if (keys.has('arrowright')) bank += 1;

  if (input.pointer.active) {
    const rect = canvas.getBoundingClientRect();
    const centreX = rect.left + rect.width / 2;
    const centreY = rect.top + rect.height / 2;
    const dx = (input.pointer.x - centreX) / (rect.width / 2);
    const dy = (input.pointer.y - centreY) / (rect.height / 2);
    bank = Math.max(-1, Math.min(1, dx * 1.4));
    pitch = Math.max(-1, Math.min(1, -dy * 1.4));
  }

  return {
    throttle,
    pitch,
    bank,
    brake: keys.has(' ') || keys.has('b'),
  };
}
