// Procedural sound: no audio files. A soft ambience (wind and birdsong by day, crickets at night,
// a low drone underneath) and small effects (footsteps, typewriter ticks, paper, a chime for a new
// lead, a sting for a contradiction, a gavel). Starts muted until the first click (autoplay rules);
// M toggles it.

type Ambience = { stop: () => void };

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: Ambience | null = null;
  private mode: "day" | "night" = "day";
  muted = true;
  private listeners = new Set<(muted: boolean) => void>();

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  onChange(fn: (muted: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setMuted(muted: boolean) {
    const ctx = this.ensure();
    this.muted = muted;
    if (ctx && this.master) {
      if (ctx.state === "suspended") void ctx.resume();
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.4);
      if (!muted && !this.ambience) this.startAmbience();
    }
    this.listeners.forEach((fn) => fn(muted));
  }

  toggle() {
    this.setMuted(!this.muted);
  }

  setScene(mode: "day" | "night") {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.ambience) {
      this.ambience.stop();
      this.ambience = null;
      if (!this.muted) this.startAmbience();
    }
  }

  // ------------------------------------------------------------ building blocks

  private noise(seconds: number): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = "sine", glide?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(this.master);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  private burst(start: number, dur: number, gain: number, freq: number, q = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(dur + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(start);
  }

  private startAmbience() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const nodes: AudioNode[] = [];
    const timers: number[] = [];
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
    out.connect(this.master);

    // wind: filtered noise with a slow wobble
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise(4);
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = "lowpass";
    wf.frequency.value = this.mode === "night" ? 380 : 520;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(wg.gain);
    wind.connect(wf).connect(wg).connect(out);
    wind.start();
    lfo.start();
    nodes.push(wind, lfo);

    // a quiet modal drone
    const root = this.mode === "night" ? 98 : 110;
    [root, root * 1.5, root * 2.01].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = [0.03, 0.012, 0.008][i];
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      o.connect(lp).connect(g).connect(out);
      o.start();
      nodes.push(o);
    });

    const chirp = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime + 0.05;
      if (this.mode === "night") {
        for (let i = 0; i < 6; i++) this.tone(4200 + Math.random() * 300, t + i * 0.06, 0.03, 0.012, "square");
      } else {
        const base = 2400 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.tone(base * (1 + Math.random() * 0.2), t + i * 0.11, 0.08, 0.02, "sine", base * 1.4);
      }
      timers.push(window.setTimeout(chirp, (this.mode === "night" ? 900 : 2500) + Math.random() * 4000));
    };
    timers.push(window.setTimeout(chirp, 1200));

    this.ambience = {
      stop: () => {
        timers.forEach((t) => window.clearTimeout(t));
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        window.setTimeout(() => nodes.forEach((n) => { try { (n as OscillatorNode).stop(); } catch { /* done */ } }), 1500);
      },
    };
  }

  // ------------------------------------------------------------ effects

  private now(): number | null {
    if (this.muted || !this.ctx) return null;
    return this.ctx.currentTime + 0.01;
  }

  step() {
    const t = this.now();
    if (t !== null) this.burst(t, 0.07, 0.08, 500 + Math.random() * 200, 2);
  }

  tick() {
    const t = this.now();
    if (t !== null) this.burst(t, 0.02, 0.025, 3200, 4);
  }

  paper() {
    const t = this.now();
    if (t !== null) this.burst(t, 0.35, 0.12, 2400, 0.6);
  }

  click() {
    const t = this.now();
    if (t !== null) this.tone(660, t, 0.08, 0.05, "triangle");
  }

  chime() {
    const t = this.now();
    if (t === null) return;
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, t + i * 0.09, 1.2, 0.07));
  }

  sting() {
    const t = this.now();
    if (t === null) return;
    this.tone(146.8, t, 1.4, 0.16, "sawtooth", 110);
    this.tone(155.6, t, 1.4, 0.1, "sawtooth", 116);
    this.burst(t, 0.5, 0.15, 180, 0.8);
  }

  gavel() {
    const t = this.now();
    if (t === null) return;
    this.burst(t, 0.25, 0.5, 220, 1.2);
    this.tone(90, t, 0.35, 0.25, "sine", 55);
  }

  whoosh() {
    const t = this.now();
    if (t === null) return;
    this.burst(t, 0.6, 0.1, 900, 0.4);
  }
}

export const sound = new Sound();
