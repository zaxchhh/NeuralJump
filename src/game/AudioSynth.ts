/**
 * Retro-style sound generator using the HTML5 Web Audio API.
 * Includes classic square, triangle, and noise effects styled for an 8-bit game.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

export const playSound = {
  /**
   * Action / Jump sound: Fast rising square wave.
   */
  jump: (volume = 0.15) => {
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.12);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.12);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  },

  /**
   * Duck Whirr sound: Fast low pitch square slide.
   */
  duck: (volume = 0.1) => {
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.setValueAtTime(90, ctx.currentTime + 0.05);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.11);
  },

  /**
   * Coin collect sound: Fast dual sparkling sound.
   */
  coin: (volume = 0.12) => {
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.08);
    gainNode.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.23);
  },

  /**
   * Milestone score reached sound.
   */
  milestone: (volume = 0.12) => {
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;

    const now = ctx.currentTime;
    // Play a lovely little triumph arpeggio
    const playNote = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, start);
      gainNode.gain.setValueAtTime(volume, start);
      gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration - 0.01);
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    playNote(523.25, now, 0.08); // C5
    playNote(659.25, now + 0.08, 0.08); // E5
    playNote(783.99, now + 0.16, 0.08); // G5
    playNote(1046.50, now + 0.24, 0.25); // C6
  },

  /**
   * Landing sound: A short low thud on hitting the ground
   */
  landing: (volume = 0.08) => {
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.08);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.08);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  },

  /**
   * Crash / Fail sound: Deep descending noise sweep
   */
  crash: (volume = 0.2) => {
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.35);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  },

  /**
   * Shoot fire sound: brief high-frequency to mid-frequency sweep
   */
  fire: (volume = 0.12) => {
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  },

  /**
   * Explosion blast sound: low saw frequency rumble decay
   */
  explosion: (volume = 0.15) => {
    const ctx = getAudioContext();
    if (!ctx || ctx.state === 'suspended') return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(30, ctx.currentTime + 0.25);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  }
};

// --- BGM Loop Sequencer Engine ---
let bgmInterval: any = null;
let bgmStep = 0;
let masterBgmVolume = 1.0;
let isBgmPlaying = false;

// Convert MIDI note number to frequency helper
const mtof = (note: number) => {
  if (note === 0) return 0;
  return Math.pow(2, (note - 69) / 12) * 440;
};

// Retro A-Minor step sequence chord lines
const bassPattern = [
  45, 45, 48, 48, 43, 43, 41, 40, // A1, C2, G1, F1-E1
  45, 45, 48, 48, 50, 50, 52, 52  // A1, C2, D2, E2
];

const melodyPattern = [
  69, 0, 72, 76, 74, 0, 71, 0,    // A4, Rest, C5, E5, D5, Rest, B4, Rest
  72, 74, 76, 79, 77, 76, 74, 71,  // C5, D5, E5, G5, F5, E5, D5, B4
  69, 0, 72, 76, 74, 0, 71, 0,    // A4, Rest, C5, E5, D5, Rest, B4, Rest
  72, 76, 74, 72, 71, 67, 69, 0    // C5, E5, D5, C5, B4, G4, A4, Rest
];

export const bgm = {
  start: () => {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Autoresume browser context on gesture
    if (ctx.state === 'suspended') {
      ctx.resume().catch((e) => console.log('BGM context resume failed:', e));
    }

    if (isBgmPlaying) return;
    isBgmPlaying = true;
    bgmStep = 0;

    const playStep = () => {
      if (!isBgmPlaying) return;

      const currentCtx = getAudioContext();
      if (!currentCtx || currentCtx.state === 'suspended') return;

      const step = bgmStep;
      bgmStep = (bgmStep + 1) % 32;

      // 1. Triangle Bass (Subdued rhythm backing)
      const bassFreq = mtof(bassPattern[step % bassPattern.length]);
      if (bassFreq > 0) {
        const osc = currentCtx.createOscillator();
        const gainNode = currentCtx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(bassFreq, currentCtx.currentTime);

        gainNode.gain.setValueAtTime(0, currentCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.045 * masterBgmVolume, currentCtx.currentTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001 * masterBgmVolume, currentCtx.currentTime + 0.16);

        osc.connect(gainNode);
        gainNode.connect(currentCtx.destination);
        osc.start();
        osc.stop(currentCtx.currentTime + 0.18);
      }

      // 2. Square Melody (Crispy retro voice)
      const melFreq = mtof(melodyPattern[step % melodyPattern.length]);
      if (melFreq > 0) {
        const osc = currentCtx.createOscillator();
        const gainNode = currentCtx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(melFreq, currentCtx.currentTime);

        gainNode.gain.setValueAtTime(0, currentCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.015 * masterBgmVolume, currentCtx.currentTime + 0.012);
        gainNode.gain.exponentialRampToValueAtTime(0.001 * masterBgmVolume, currentCtx.currentTime + 0.150);

        osc.connect(gainNode);
        gainNode.connect(currentCtx.destination);
        osc.start();
        osc.stop(currentCtx.currentTime + 0.18);
      }
    };

    if (bgmInterval) {
      clearInterval(bgmInterval);
    }
    // Speed tempo step delay of 180ms
    bgmInterval = setInterval(playStep, 180);
    playStep();
  },

  stop: () => {
    isBgmPlaying = false;
    if (bgmInterval) {
      clearInterval(bgmInterval);
      bgmInterval = null;
    }
  },

  setMuted: (muted: boolean) => {
    masterBgmVolume = muted ? 0 : 1.0;
  }
};
