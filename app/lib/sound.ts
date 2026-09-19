"use client";

let ctx: AudioContext | null = null;
let sfxOn = true;

export function setSfxEnabled(v: boolean) {
  sfxOn = v;
}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function blip(freq: number, dur: number, type: OscillatorType, gain: number, when = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// ---- one-shot SFX ----
export function playTick(high = false) {
  if (sfxOn) blip(high ? 1040 : 620, 0.09, "square", 0.12);
}
export function playBoard() {
  if (sfxOn) blip(523, 0.12, "triangle", 0.18);
}
export function playDoors() {
  if (!sfxOn) return;
  blip(300, 0.25, "sawtooth", 0.15);
  blip(220, 0.3, "sawtooth", 0.12, 0.05);
}
export function playEliminate() {
  if (!sfxOn) return;
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(400, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(70, c.currentTime + 0.4);
  g.gain.setValueAtTime(0.35, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.45);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.47);
}
export function playSurvive() {
  if (!sfxOn) return;
  [659, 784, 988, 1319].forEach((f, i) => blip(f, 0.18, "triangle", 0.2, i * 0.09));
}

// ---- looping upbeat chiptune ----
let musicTimer: any = null;
let step = 0;
let nextTime = 0;
const BPM = 132;
const STEP = 60 / BPM / 2; // eighth notes
// bouncy bass (A minor-ish, upbeat)
const BASS = [110, 110, 165, 110, 146.83, 146.83, 130.81, 164.81];
const ARP = [440, 523.25, 659.25, 523.25, 587.33, 659.25, 783.99, 659.25];

function scheduleStep(c: AudioContext, i: number, t: number) {
  // bass
  const b = c.createOscillator();
  const bg = c.createGain();
  b.type = "triangle";
  b.frequency.setValueAtTime(BASS[i % 8], t);
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 0.9);
  b.connect(bg).connect(c.destination);
  b.start(t);
  b.stop(t + STEP);
  // lead arp (a touch quieter)
  const l = c.createOscillator();
  const lg = c.createGain();
  l.type = "square";
  l.frequency.setValueAtTime(ARP[i % 8], t);
  lg.gain.setValueAtTime(0.0001, t);
  lg.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
  lg.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 0.7);
  l.connect(lg).connect(c.destination);
  l.start(t);
  l.stop(t + STEP);
  // hats every step
  if (i % 2 === 1) blipNoise(c, t, 0.03);
}

function blipNoise(c: AudioContext, t: number, dur: number) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buf;
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(g).connect(c.destination);
  src.start(t);
}

export function startMusic() {
  const c = ac();
  if (!c || musicTimer) return;
  nextTime = c.currentTime + 0.1;
  step = 0;
  const loop = () => {
    const cc = ac();
    if (!cc) return;
    while (nextTime < cc.currentTime + 0.2) {
      scheduleStep(cc, step, nextTime);
      nextTime += STEP;
      step++;
    }
    musicTimer = setTimeout(loop, 60);
  };
  loop();
}

export function stopMusic() {
  if (musicTimer) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
}

export function isMusicOn() {
  return !!musicTimer;
}

// robotic French announcement (part of the joke)
export function speak(text: string) {
  if (!sfxOn || typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR";
  u.rate = 1.0;
  const fr = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("fr"));
  if (fr) u.voice = fr;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
