/**
 * Synthesised sound effects (Web Audio). No audio files yet: these are
 * placeholders for designed sounds, but they give every action feedback.
 */
export type Sfx = 'roll' | 'move' | 'capture' | 'home' | 'win' | 'bust';

let ctx: AudioContext | null = null;
let enabled = true;

export const setSoundEnabled = (on: boolean) => {
  enabled = on;
};

function tone(c: AudioContext, at: number, freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur);
}

/** Play an effect. Must first be called from a tap or click so the browser allows audio. */
export function play(sfx: Sfx) {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const c = ctx;
    const t = c.currentTime;
    if (sfx === 'roll') for (let i = 0; i < 6; i++) tone(c, t + i * 0.07, 500 + Math.random() * 500, 0.05, 'square', 0.05);
    else if (sfx === 'move') tone(c, t, 520, 0.09, 'triangle', 0.12, 760);
    else if (sfx === 'capture') tone(c, t, 620, 0.35, 'sawtooth', 0.1, 110);
    else if (sfx === 'bust') tone(c, t, 300, 0.4, 'square', 0.07, 120);
    else if (sfx === 'home') [660, 880, 1100].forEach((f, i) => tone(c, t + i * 0.09, f, 0.18, 'triangle', 0.13));
    else [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, t + i * 0.12, f, 0.3, 'triangle', 0.14));
  } catch {
    /* audio unavailable: play silently */
  }
}
