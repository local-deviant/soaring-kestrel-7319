// Sound — everything synthesised in WebAudio, no audio files.
//
// The engine is a low sawtooth whose pitch follows the throttle, the
// wind is filtered noise that rises with airspeed, and the events are
// short envelopes: a chime for a ring, a warble for a stall, a thud for
// the wheels, a little fanfare for a sortie well flown. The context is
// created on the first user gesture, so the game never plays uninvited.

export function createAudio() {
  return {
    context: null,
    engine: null,
    engineGain: null,
    wind: null,
    windGain: null,
    muted: false,
  };
}

function ensureContext(audio) {
  if (audio.context) return true;
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    audio.context = new Context();
  } catch {
    return false;
  }
  const ctx = audio.context;

  // Engine: two detuned saws through a low-pass, quiet at idle.
  const engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  const oscA = ctx.createOscillator();
  oscA.type = 'sawtooth';
  oscA.frequency.value = 52;
  const oscB = ctx.createOscillator();
  oscB.type = 'sawtooth';
  oscB.frequency.value = 55;
  oscA.connect(filter);
  oscB.connect(filter);
  filter.connect(engineGain);
  engineGain.connect(ctx.destination);
  oscA.start();
  oscB.start();

  // Wind: a loop of noise through a band-pass that opens with speed.
  const noiseLength = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < noiseLength; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 700;
  band.Q.value = 0.6;
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  noise.connect(band);
  band.connect(windGain);
  windGain.connect(ctx.destination);
  noise.start();

  audio.engine = [oscA, oscB];
  audio.engineGain = engineGain;
  audio.windGain = windGain;
  audio.filter = filter;
  return true;
}

function blip(audio, frequency, when, duration, volume, type) {
  if (!audio.context || audio.muted) return;
  const ctx = audio.context;
  const osc = ctx.createOscillator();
  osc.type = type || 'sine';
  osc.frequency.value = frequency;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime + when);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + when);
  osc.stop(ctx.currentTime + when + duration + 0.05);
}

// Called every frame with the aeroplane's state: the engine and the wind
// follow the throttle and the airspeed.
export function updateAudio(audio, plane) {
  if (audio.muted || !ensureContext(audio)) return;
  const ctx = audio.context;
  if (ctx.state === 'suspended') void ctx.resume();
  const rpm = 46 + plane.throttle * 66;
  audio.engine[0].frequency.setTargetAtTime(rpm, ctx.currentTime, 0.08);
  audio.engine[1].frequency.setTargetAtTime(rpm * 1.01, ctx.currentTime, 0.08);
  audio.filter.frequency.setTargetAtTime(320 + plane.throttle * 900, ctx.currentTime, 0.1);
  audio.engineGain.gain.setTargetAtTime(plane.onGround ? 0.02 + plane.throttle * 0.05 : 0.03 + plane.throttle * 0.06, ctx.currentTime, 0.1);
  const windLevel = plane.onGround ? 0 : Math.min(0.16, (plane.speed / 80) * 0.16);
  audio.windGain.gain.setTargetAtTime(windLevel, ctx.currentTime, 0.15);
}

export function playRing(audio) {
  blip(audio, 880, 0, 0.18, 0.16);
  blip(audio, 1318, 0.09, 0.3, 0.14);
}

export function playStall(audio) {
  blip(audio, 220, 0, 0.5, 0.12, 'square');
  blip(audio, 220, 0.55, 0.5, 0.12, 'square');
}

export function playTouchdown(audio) {
  blip(audio, 90, 0, 0.25, 0.25, 'triangle');
}

export function playCrash(audio) {
  blip(audio, 70, 0, 0.8, 0.3, 'sawtooth');
  blip(audio, 55, 0.1, 0.9, 0.25, 'square');
}

export function playFanfare(audio) {
  const notes = [523, 659, 784, 1046];
  notes.forEach((note, index) => blip(audio, note, index * 0.13, 0.35, 0.14));
}

export function toggleMute(audio) {
  audio.muted = !audio.muted;
  if (audio.context) {
    if (audio.muted) {
      audio.engineGain.gain.setTargetAtTime(0, audio.context.currentTime, 0.05);
      audio.windGain.gain.setTargetAtTime(0, audio.context.currentTime, 0.05);
    }
  }
  return audio.muted;
}
