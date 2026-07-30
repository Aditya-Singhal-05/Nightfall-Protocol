let ctx = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(ac, duration) {
  const buffer = ac.createBuffer(1, ac.sampleRate * duration, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function playGunshot(volume = 0.5) {
  const ac = getCtx();
  const t = ac.currentTime;

  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.18);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  src.connect(bp).connect(gain).connect(ac.destination);
  src.start(t); src.stop(t + 0.18);

  const osc = ac.createOscillator();
  osc.type = 'square'; osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.09);
  const og = ac.createGain();
  og.gain.setValueAtTime(volume * 0.9, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc.connect(og).connect(ac.destination);
  osc.start(t); osc.stop(t + 0.1);
}

export function playFootstep(volume = 0.15) {
  const ac = getCtx();
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.06);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 500 + Math.random() * 300;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  src.connect(lp).connect(gain).connect(ac.destination);
  src.start(t); src.stop(t + 0.06);
}

export function playReload(volume = 0.3) {
  const ac = getCtx();
  const t = ac.currentTime;
  [0, 0.18].forEach((delay) => {
    const osc = ac.createOscillator();
    osc.type = 'triangle'; osc.frequency.value = 500;
    const g = ac.createGain();
    g.gain.setValueAtTime(volume, t + delay);
    g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.06);
    osc.connect(g).connect(ac.destination);
    osc.start(t + delay); osc.stop(t + delay + 0.07);
  });
}

export function playHit(volume = 0.25) {
  const ac = getCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'sine'; osc.frequency.setValueAtTime(900, t);
  osc.frequency.exponentialRampToValueAtTime(200, t + 0.08);
  const g = ac.createGain();
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  osc.connect(g).connect(ac.destination);
  osc.start(t); osc.stop(t + 0.09);
}

export function playExplosion(volume = 0.7) {
  const ac = getCtx();
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 1.2);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(1800, t);
  lp.frequency.exponentialRampToValueAtTime(80, t + 1.0);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
  src.connect(lp).connect(gain).connect(ac.destination);
  src.start(t); src.stop(t + 1.2);
}

export function playAlarm(volume = 0.25) {
  const ac = getCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.linearRampToValueAtTime(900, t + 0.4);
  osc.frequency.linearRampToValueAtTime(600, t + 0.8);
  const g = ac.createGain();
  g.gain.setValueAtTime(volume, t);
  g.gain.setValueAtTime(volume, t + 0.75);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  osc.connect(g).connect(ac.destination);
  osc.start(t); osc.stop(t + 0.85);
}

export function playBeep(freq = 800, volume = 0.2, dur = 0.08) {
  const ac = getCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'sine'; osc.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t); osc.stop(t + dur);
}

export function unlockAudio() { getCtx(); }
