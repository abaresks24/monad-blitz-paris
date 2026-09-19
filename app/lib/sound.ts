"use client";
import { CHIME_NOTES } from "./announcements";

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}
export function isSoundEnabled() {
  return enabled;
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

/** Original synthesized 3-note quay chime (WebAudio). */
export function playChime() {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime;
  CHIME_NOTES.forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const start = t0 + i * 0.16;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.25, start + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    o.connect(g).connect(c.destination);
    o.start(start);
    o.stop(start + 0.55);
  });
}

/** A short "tick" for the last seconds of a countdown. */
export function playTick(high = false) {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "square";
  o.frequency.value = high ? 880 : 440;
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.14);
}

/** Heavy stamp thud for the AMENDE animation. */
export function playStamp() {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(180, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.18);
  g.gain.setValueAtTime(0.4, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.3);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.32);
}

/** Robotic French announcement via the browser's speechSynthesis (part of the joke). */
export function speak(text: string) {
  if (!enabled) return;
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR";
  u.rate = 0.98;
  u.pitch = 1.0;
  const frVoice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("fr"));
  if (frVoice) u.voice = frVoice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function announce(text: string) {
  playChime();
  // let the chime breathe before the voice
  setTimeout(() => speak(text), 700);
}
