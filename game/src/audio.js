// Procedural WebAudio only — no audio files. Every sound is synthesized:
// noise bursts through filters for shots and footsteps, short oscillator
// blips for UI and beeps, two-note stingers for round ends. The context is
// created lazily on the first user gesture; every call is a no-op until then
// (shot captures run without a gesture and must never throw).
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;
  let master = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noise(dur, filterType, freq, gainVal, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, type, gainVal, when = 0, slideTo = null) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    shot(id) {
      if (!ensure()) return;
      if (id === 'sniper') {
        noise(0.28, 'lowpass', 900, 0.9);
        noise(0.12, 'highpass', 2400, 0.5);
        tone(120, 0.18, 'sine', 0.5, 0, 50);
      } else if (id === 'pistol') {
        noise(0.12, 'bandpass', 1400, 0.7);
        tone(220, 0.08, 'square', 0.2, 0, 90);
      } else if (id === 'smg') {
        noise(0.09, 'bandpass', 1800, 0.55);
      } else {
        noise(0.16, 'lowpass', 1200, 0.8);
        noise(0.07, 'highpass', 3000, 0.35);
      }
    },
    dryFire() {
      tone(1800, 0.03, 'square', 0.15);
    },
    reload() {
      tone(900, 0.04, 'square', 0.2);
      tone(600, 0.04, 'square', 0.2, 0.18);
      tone(1200, 0.05, 'square', 0.25, 0.4);
    },
    hit() {
      tone(2400, 0.05, 'sine', 0.35);
    },
    kill() {
      tone(880, 0.07, 'sine', 0.4);
      tone(1320, 0.12, 'sine', 0.4, 0.07);
    },
    hurt() {
      noise(0.15, 'lowpass', 500, 0.5);
      tone(140, 0.15, 'sawtooth', 0.2, 0, 70);
    },
    step() {
      noise(0.06, 'lowpass', 400, 0.12);
    },
    plantBeep() {
      tone(1200, 0.08, 'square', 0.25);
    },
    defuseBeep() {
      tone(900, 0.08, 'square', 0.25);
    },
    planted() {
      tone(660, 0.12, 'square', 0.3);
      tone(660, 0.12, 'square', 0.3, 0.15);
      tone(990, 0.2, 'square', 0.3, 0.3);
    },
    explosion() {
      noise(0.7, 'lowpass', 400, 1.0);
      tone(60, 0.6, 'sine', 0.8, 0, 30);
      noise(0.25, 'highpass', 2000, 0.4, 0.02);
    },
    roundWin() {
      tone(523, 0.14, 'triangle', 0.4);
      tone(659, 0.14, 'triangle', 0.4, 0.13);
      tone(784, 0.28, 'triangle', 0.45, 0.26);
    },
    roundLose() {
      tone(392, 0.16, 'triangle', 0.4);
      tone(330, 0.16, 'triangle', 0.4, 0.15);
      tone(262, 0.32, 'triangle', 0.45, 0.3);
    },
    buy() {
      tone(1500, 0.05, 'sine', 0.3);
      tone(2000, 0.06, 'sine', 0.25, 0.05);
    },
    denied() {
      tone(200, 0.12, 'square', 0.25);
    },
  };
}
